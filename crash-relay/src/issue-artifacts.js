import { createGitHubIssueArtifactWriter } from '@dustwave/desktop-core/github-issue-artifacts';
import { githubRequest, fingerprintMarker, parseState } from './github.js';

export const writeIssueArtifact = createGitHubIssueArtifactWriter({ request: githubRequest });

export function aggregateArtifact(_report, _fingerprint, state) {
  // Keep aggregate history useful without retaining individual messages, stacks or notes.
  const versions = JSON.stringify(Object.fromEntries(Object.entries(state.versions).slice(-32)), null, 2)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return {
    name: 'Diagnostic report history',
    body: `Reports: ${state.count}\n\nFirst seen: ${state.firstSeen}\n\nLast seen: ${state.lastSeen}\n\n### App versions\n\n<pre>${versions}</pre>`
  };
}

// Native intake has already confirmed the issue. Its receipt waits only for
// durable scheduling. Alarms retry publication independently of the request.
const nativeTimeoutMS = 15000;
const writeNativeArtifact = createGitHubIssueArtifactWriter({ request: githubRequest, timeoutMS: nativeTimeoutMS });

export class AsciiArtifactMirror {
  constructor(ctx, env, request = githubRequest, write = writeNativeArtifact) {
    this.storage = ctx.storage;
    this.env = env;
    this.request = request;
    this.write = write;
  }

  async fetch(request) {
    const { issueNumber, fingerprint } = await request.json();
    if (!Number.isSafeInteger(issueNumber) || issueNumber < 1 || typeof fingerprint !== 'string'
      || !/^[a-f0-9]{20}$/.test(fingerprint)) return new Response(null, { status: 400 });

    await this.storage.transaction(async txn => {
      await txn.put('target', { issueNumber, fingerprint });
      // An alarm in progress returns null here. An update during publication
      // therefore schedules a follow-up read without waiting for GitHub.
      if (await txn.getAlarm() === null) await txn.setAlarm(Date.now());
    });
    return new Response(null, { status: 202 });
  }

  async alarm({ retryCount = 0 } = {}) {
    if (this.env.ISSUE_ARTIFACTS_ENABLED !== 'true') return;
    const target = await this.storage.get('target');
    if (!target) return;
    const { issueNumber, fingerprint } = target;
    const owner = this.env.GITHUB_OWNER || 'aindaco1';
    const repository = this.env.GITHUB_REPO || 'ascii-vj-remix';
    let stage = 'read-issue';
    try {
      const issue = await this.request(this.env, `/repos/${owner}/${repository}/issues/${issueNumber}`,
        { method: 'GET', signal: AbortSignal.timeout(nativeTimeoutMS) });
      const state = parseState(issue?.body || '', fingerprint);
      if (issue?.number !== issueNumber || !issue.body?.startsWith(fingerprintMarker(fingerprint) + '\n')
        || state.fingerprint !== fingerprint || !Number.isSafeInteger(state.count) || state.count < 1) {
        console.error({ code: 'ascii-artifact-invalid-aggregate', issueNumber });
        return;
      }
      stage = 'write-artifact';
      await this.write(this.env, { owner, repository, issueNumber, key: fingerprint,
        ...aggregateArtifact(null, fingerprint, state) }, {
        get: () => this.storage.get('artifact'), put: value => this.storage.put('artifact', value)
      });
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : undefined;
      console.error({ code: 'ascii-artifact-alarm-failed', stage, issueNumber, retryCount, status,
        timeout: error?.name === 'TimeoutError' });
      // Cloudflare retries a thrown alarm. The writer reconciles its persisted
      // create intent before making another write after an ambiguous response.
      throw new Error('ASCII artifact failure during ' + stage);
    }
  }
}

export async function mirrorAsciiIssue(env, { issueNumber }, fingerprint) {
  const groups = env.ASCII_ARTIFACTS;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const stub = groups.get(groups.idFromName(`${issueNumber}:${fingerprint}`));
      const response = await stub.fetch('https://internal/artifact', {
        method: 'POST', body: JSON.stringify({ issueNumber, fingerprint }),
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) throw new Error('Artifact enqueue rejected');
      return;
    } catch (error) {
      const timeout = error?.name === 'TimeoutError';
      console.error({ code: 'ascii-artifact-enqueue-failed', issueNumber, attempt, timeout });
      if (attempt === 2 || error?.overloaded || !(timeout || error?.retryable)) return;
    }
  }
}
