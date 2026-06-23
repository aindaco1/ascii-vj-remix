#!/usr/bin/env node
import path from 'node:path';
import {
  originRepo,
  readTrimmedFile,
  requireGhAndRepo,
  setSecret
} from './lib/github_secrets.mjs';
import { existsSync } from 'node:fs';

const DEFAULT_KEY_PATH = '/private/tmp/ascii-vj-remix-updater.key';
const DEFAULT_PASSWORD_PATH = '/private/tmp/ascii-vj-remix-updater.password';
const DEFAULT_SECRET_NAME = 'TAURI_SIGNING_PRIVATE_KEY';
const DEFAULT_PASSWORD_SECRET_NAME = 'TAURI_SIGNING_PRIVATE_KEY_PASSWORD';

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
  console.log(`Usage: node scripts/set_tauri_updater_secret.mjs [options]

Uploads the local Tauri updater private key to GitHub Actions secrets using gh.
The secret is passed over stdin and is never printed.

Options:
  --key <path>             Private key path. Default: ${DEFAULT_KEY_PATH}
  --repo <owner/repo>      GitHub repo. Default: parsed from origin remote
  --password-file <path>   Updater key password file. Defaults to ${DEFAULT_PASSWORD_PATH} when it exists
  --secret-name <name>     Key secret name. Default: ${DEFAULT_SECRET_NAME}
  --password-secret-name <name>
                           Password secret name. Default: ${DEFAULT_PASSWORD_SECRET_NAME}
  --dry-run                Validate inputs without uploading secrets
  --help                   Show this help
`);
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  usage();
  process.exit(0);
}

const keyPath = path.resolve(args.key || DEFAULT_KEY_PATH);
const repo = args.repo || originRepo();
const secretName = args.secretName || DEFAULT_SECRET_NAME;
const passwordSecretName = args.passwordSecretName || DEFAULT_PASSWORD_SECRET_NAME;

try {
  requireGhAndRepo(repo);

  const key = await readTrimmedFile(keyPath, 'updater private key');
  let password = '';
  const passwordPath = args.passwordFile
    ? path.resolve(args.passwordFile)
    : existsSync(DEFAULT_PASSWORD_PATH)
      ? DEFAULT_PASSWORD_PATH
      : '';
  if (passwordPath) {
    password = await readTrimmedFile(passwordPath, 'updater private key password');
  }

  if (args.dryRun) {
    console.log(`Updater secret dry run passed for ${repo}: ${secretName}${password ? ` and ${passwordSecretName}` : ''}.`);
    process.exit(0);
  }

  setSecret({ repo, name: secretName, value: key });
  if (password) setSecret({ repo, name: passwordSecretName, value: password });

  console.log(`Uploaded updater signing secret${password ? 's' : ''} to ${repo}.`);
} catch (error) {
  console.error(`Failed to set updater secret: ${error.message}`);
  process.exit(1);
}
