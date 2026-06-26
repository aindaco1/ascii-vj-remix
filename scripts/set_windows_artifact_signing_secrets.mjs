#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  originRepo,
  readTrimmedFile,
  requireGhAndRepo,
  setSecret,
  setVariable
} from './lib/github_secrets.mjs';

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      out.dryRun = true;
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
  console.log(`Usage: node scripts/set_windows_artifact_signing_secrets.mjs [options]

Uploads Windows Azure Artifact Signing values to GitHub Actions.
The client secret is read from a file and sent to gh over stdin.

Required:
  --client-id <value>              Microsoft Entra app/client ID
  --tenant-id <value>              Microsoft Entra tenant/directory ID
  --client-secret-file <path>      Microsoft Entra client secret value
  --endpoint <url>                 Azure Artifact Signing endpoint
  --account <name>                 Azure Artifact Signing account name
  --certificate-profile <name>     Public trust certificate profile name

Optional:
  --description <value>            Authenticode description. Default: ASCII VJ Remix
  --repo <owner/repo>              GitHub repo. Default: parsed from origin remote
  --dry-run                        Validate inputs without uploading values
  --help                           Show this help
`);
}

function requireAll(args, names) {
  const missing = names.filter((name) => !args[name]);
  if (missing.length > 0) {
    throw new Error(`Windows Artifact Signing is missing required option(s): ${missing.map((name) => `--${name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}`).join(', ')}`);
  }
}

function validateArgs(args) {
  requireAll(args, [
    'clientId',
    'tenantId',
    'clientSecretFile',
    'endpoint',
    'account',
    'certificateProfile'
  ]);

  if (!/^https:\/\//i.test(args.endpoint)) {
    throw new Error('--endpoint must be an HTTPS URL');
  }

  return true;
}

async function buildValues(args) {
  validateArgs(args);

  const variables = [
    ['AZURE_CLIENT_ID', args.clientId],
    ['AZURE_TENANT_ID', args.tenantId],
    ['AZURE_ARTIFACT_SIGNING_ENDPOINT', args.endpoint],
    ['AZURE_ARTIFACT_SIGNING_ACCOUNT', args.account],
    ['AZURE_ARTIFACT_SIGNING_CERTIFICATE_PROFILE', args.certificateProfile]
  ];

  if (args.description) {
    variables.push(['AZURE_ARTIFACT_SIGNING_DESCRIPTION', args.description]);
  }

  const secrets = [
    ['AZURE_CLIENT_SECRET', await readTrimmedFile(path.resolve(args.clientSecretFile), 'Azure client secret')]
  ];

  return { variables, secrets };
}

if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }

  const repo = args.repo || originRepo();

  try {
    requireGhAndRepo(repo);
    const { variables, secrets } = await buildValues(args);

    if (args.dryRun) {
      console.log(`Windows Artifact Signing secret dry run passed for ${repo}: ${variables.map(([name]) => name).concat(secrets.map(([name]) => name)).join(', ')}.`);
      process.exit(0);
    }

    for (const [name, value] of variables) {
      setVariable({ repo, name, value });
    }
    for (const [name, value] of secrets) {
      setSecret({ repo, name, value });
    }

    console.log(`Uploaded Windows Artifact Signing values to ${repo}.`);
  } catch (error) {
    console.error(`Failed to set Windows Artifact Signing values: ${error.message}`);
    process.exit(1);
  }
}

export {
  parseArgs,
  validateArgs
};
