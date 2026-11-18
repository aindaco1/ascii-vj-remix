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

// The original ASCII intake uses KV and a cooldown for issue updates. Serialize
// only its supplemental writes, reading current issue state inside the queue.
export class AsciiArtifactMirror {
  constructor(ctx, env, request = githubRequest, write = writeIssueArtifact) {
    this.storage = ctx.storage;
    this.env = env;
    this.request = request;
    this.write = write;
    this.tail = Promise.resolve();
  }

  fetch(request) {
    const next = this.tail.then(async () => {
      const { issueNumber, fingerprint } = await request.json();
      if (!Number.isSafeInteger(issueNumber) || issueNumber < 1 || !/^[a-f0-9]{20}$/.test(fingerprint)) {
        return new Response(null, { status: 400 });
      }
      const owner = this.env.GITHUB_OWNER || 'aindaco1';
      const repository = this.env.GITHUB_REPO || 'ascii-vj-remix';
      const issue = await this.request(this.env, `/repos/${owner}/${repository}/issues/${issueNumber}`,
        { method: 'GET', signal: AbortSignal.timeout(5000) });
      if (issue.number !== issueNumber || !issue.body?.startsWith(fingerprintMarker(fingerprint) + '\n')) {
        throw new Error('Issue marker mismatch');
      }
      const state = parseState(issue.body, fingerprint);
      if (state.fingerprint !== fingerprint || !Number.isSafeInteger(state.count) || state.count < 1) {
        throw new Error('Missing confirmed aggregate');
      }
      await this.write(this.env, { owner, repository, issueNumber, key: fingerprint,
        ...aggregateArtifact(null, fingerprint, state) }, {
        get: () => this.storage.get('artifact'), put: value => this.storage.put('artifact', value)
      });
      return new Response(null, { status: 204 });
    });
    this.tail = next.catch(() => {});
    return next;
  }
}

export async function mirrorAsciiIssue(env, result, fingerprint) {
  try {
    const groups = env.ASCII_ARTIFACTS;
    const stub = groups.get(groups.idFromName(`${result.issueNumber}:${fingerprint}`));
    const response = await stub.fetch('https://internal/artifact', {
      method: 'POST', body: JSON.stringify({ issueNumber: result.issueNumber, fingerprint })
    });
    if (!response.ok) throw new Error('Artifact mirror failed');
  } catch {
    console.error({ code: 'ascii-issue-artifact-failed' });
  }
}
