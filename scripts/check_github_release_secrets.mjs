#!/usr/bin/env node
import {
  commandWorks,
  listActionSecrets,
  originRepo,
  requireGhAndRepo
} from './lib/github_secrets.mjs';

const REQUIRED_UPDATER_SECRETS = ['TAURI_SIGNING_PRIVATE_KEY'];
const CERTIFICATE_SECRETS = ['APPLE_CERTIFICATE', 'APPLE_CERTIFICATE_PASSWORD', 'KEYCHAIN_PASSWORD'];
const API_NOTARIZATION_SECRETS = ['APPLE_API_KEY', 'APPLE_API_ISSUER', 'APPLE_API_KEY_P8'];
const APPLE_ID_NOTARIZATION_SECRETS = ['APPLE_ID', 'APPLE_PASSWORD', 'APPLE_TEAM_ID'];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--require-notarization') {
      out.requireNotarization = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      out.help = true;
      continue;
    }
    if (!arg.startsWith('--')) throw new Error(`unexpected argument: ${arg}`);
    const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${arg}`);
    out[key] = value;
    i += 1;
  }
  return out;
}

function usage() {
  console.log(`Usage: node scripts/check_github_release_secrets.mjs [options]

Checks GitHub Actions secret readiness without reading secret values.

Options:
  --repo <owner/repo>        GitHub repo. Default: parsed from origin remote
  --require-notarization    Fail if Apple Developer ID notarization secrets are absent
  --help                    Show this help
`);
}

function missingFrom(secrets, names) {
  return names.filter((name) => !secrets.has(name));
}

function presentAny(secrets, names) {
  return names.some((name) => secrets.has(name));
}

function describeGroup(secrets, label, names) {
  const missing = missingFrom(secrets, names);
  return {
    label,
    complete: missing.length === 0,
    partial: missing.length > 0 && missing.length < names.length,
    present: presentAny(secrets, names),
    missing
  };
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  usage();
  process.exit(0);
}

const issues = [];
const notes = [];
const repo = args.repo || originRepo();

try {
  requireGhAndRepo(repo);

  const secrets = listActionSecrets(repo);
  for (const name of missingFrom(secrets, REQUIRED_UPDATER_SECRETS)) {
    issues.push(`missing required updater secret ${name}`);
  }

  const certificate = describeGroup(secrets, 'Developer ID certificate', CERTIFICATE_SECRETS);
  const api = describeGroup(secrets, 'App Store Connect notarization', API_NOTARIZATION_SECRETS);
  const appleId = describeGroup(secrets, 'Apple ID notarization', APPLE_ID_NOTARIZATION_SECRETS);
  const anyAppleSecret = certificate.present || api.present || appleId.present;
  const notarizationReady = certificate.complete && (api.complete || appleId.complete);

  for (const group of [certificate, api, appleId]) {
    if (group.partial) {
      issues.push(`${group.label} secrets are partially configured; missing ${group.missing.join(', ')}`);
    }
  }

  if (args.requireNotarization && !notarizationReady) {
    issues.push('Apple Developer ID notarization secrets are not complete');
  }

  if (!args.requireNotarization && !anyAppleSecret) {
    notes.push('Apple Developer ID notarization secrets are absent; macOS release workflow will use ad-hoc signing.');
  } else if (!notarizationReady && anyAppleSecret) {
    issues.push('Apple Developer ID notarization secrets are present but not complete enough to enable notarized macOS releases');
  } else if (notarizationReady) {
    notes.push(`Apple Developer ID notarization is ready using ${api.complete ? 'App Store Connect API' : 'Apple ID'} credentials.`);
  }

  if (issues.length > 0) {
    console.error(`GitHub release secret check failed for ${repo}:`);
    for (const issue of issues) console.error(`- ${issue}`);
    for (const note of notes) console.error(`- ${note}`);
    process.exit(1);
  }

  console.log(`GitHub release secret check passed for ${repo}.`);
  for (const note of notes) console.log(note);
} catch (error) {
  console.error(`Failed to check GitHub release secrets: ${error.message}`);
  process.exit(1);
}
