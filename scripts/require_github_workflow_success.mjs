#!/usr/bin/env node

import process from 'node:process';
import { selectWorkflowRun, workflowRunState } from './lib/github_workflow_acceptance.mjs';

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) throw new Error(`unexpected argument: ${arg}`);
    const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${arg}`);
    out[key] = value;
    index += 1;
  }
  return out;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWorkflowRuns({ repository, workflow, commit, token }) {
  const url = new URL(`https://api.github.com/repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/runs`);
  url.searchParams.set('head_sha', commit);
  url.searchParams.set('per_page', '20');
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'ascii-vj-remix-release-acceptance'
    }
  });
  if (!response.ok) {
    throw new Error(`GitHub Actions API returned ${response.status} ${response.statusText}`);
  }
  const payload = await response.json();
  return Array.isArray(payload.workflow_runs) ? payload.workflow_runs : [];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repository = args.repository || process.env.GITHUB_REPOSITORY;
  const workflow = args.workflow || 'desktop.yml';
  const commit = String(args.commit || '').trim();
  const branch = args.branch || 'main';
  const event = args.event || 'push';
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const timeoutMs = Number(args.timeoutMs || 15 * 60 * 1000);
  const pollMs = Number(args.pollMs || 15 * 1000);

  if (!repository || !/^[-A-Za-z0-9_.]+\/[-A-Za-z0-9_.]+$/.test(repository)) {
    throw new Error('a valid --repository owner/name or GITHUB_REPOSITORY is required');
  }
  if (!commit || !/^[0-9a-f]{40}$/i.test(commit)) {
    throw new Error('--commit must be a full 40-character Git commit');
  }
  if (!token) throw new Error('GH_TOKEN or GITHUB_TOKEN is required');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('--timeout-ms must be positive');
  if (!Number.isFinite(pollMs) || pollMs < 1000) throw new Error('--poll-ms must be at least 1000');

  const deadline = Date.now() + timeoutMs;
  let lastMessage = '';
  let transientErrors = 0;
  while (Date.now() < deadline) {
    try {
      const runs = await fetchWorkflowRuns({ repository, workflow, commit, token });
      const run = selectWorkflowRun(runs, { commit, branch, event });
      const state = workflowRunState(run);
      transientErrors = 0;

      if (state.state === 'accepted') {
        console.log(`Accepted exact ${workflow} ${event} run for ${commit}: ${run.html_url || run.id}`);
        return;
      }
      if (state.state === 'rejected') {
        throw new Error(`${state.message}: ${run.html_url || run.id}`);
      }
      if (state.message !== lastMessage) {
        console.log(`Waiting for exact ${workflow} ${event} run on ${branch} at ${commit}: ${state.message}`);
        lastMessage = state.message;
      }
    } catch (error) {
      if (/completed with/.test(error.message || '')) throw error;
      transientErrors += 1;
      if (transientErrors >= 4) throw error;
      console.warn(`GitHub Actions acceptance query failed (${transientErrors}/4): ${error.message}`);
    }
    await delay(Math.min(pollMs, Math.max(0, deadline - Date.now())));
  }
  throw new Error(`timed out waiting for exact ${workflow} ${event} success on ${branch} at ${commit}`);
}

main().catch((error) => {
  console.error(`Release source acceptance failed: ${error.message}`);
  process.exit(1);
});
