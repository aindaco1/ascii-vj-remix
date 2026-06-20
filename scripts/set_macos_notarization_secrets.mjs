#!/usr/bin/env node
import crypto from 'node:crypto';
import path from 'node:path';
import {
  originRepo,
  readBase64File,
  readTrimmedFile,
  requireGhAndRepo,
  setSecret
} from './lib/github_secrets.mjs';

const isMain = import.meta.url === `file://${process.argv[1]}`;

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
  console.log(`Usage: node scripts/set_macos_notarization_secrets.mjs [options]

Uploads macOS Developer ID signing and notarization secrets to GitHub Actions.
Values are sent to gh over stdin and are never printed.

Required certificate options:
  --certificate <path>             Developer ID Application .p12 export
  --certificate-password-file <path>
                                   Password for the .p12 export

Required notarization options, choose one group:
  App Store Connect API:
    --api-key <key-id>
    --api-issuer <issuer-id>
    --api-key-file <path>          Downloaded .p8 private key

  Apple ID:
    --apple-id-file <path>         Apple account email
    --apple-password-file <path>   App-specific password
    --apple-team-id <team-id>

Optional:
  --keychain-password-file <path>  Temporary CI keychain password.
                                   Generated when omitted.
  --repo <owner/repo>              GitHub repo. Default: parsed from origin remote
  --dry-run                        Validate inputs without uploading secrets
  --help                           Show this help
`);
}

function hasApiArgs(args) {
  return Boolean(args.apiKey || args.apiIssuer || args.apiKeyFile);
}

function hasAppleIdArgs(args) {
  return Boolean(args.appleIdFile || args.applePasswordFile || args.appleTeamId);
}

function requireAll(args, names, label) {
  const missing = names.filter((name) => !args[name]);
  if (missing.length > 0) {
    throw new Error(`${label} is missing required option(s): ${missing.map((name) => `--${name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}`).join(', ')}`);
  }
}

async function valueFromFileOrGenerated(filePath, label) {
  if (filePath) return readTrimmedFile(path.resolve(filePath), label);
  return crypto.randomBytes(24).toString('base64url');
}

const args = parseArgs(process.argv.slice(2));
if (isMain && args.help) {
    usage();
    process.exit(0);
}

function validateNotarizationArgs(args) {
  requireAll(args, ['certificate', 'certificatePasswordFile'], 'Developer ID certificate');

  const usingApi = hasApiArgs(args);
  const usingAppleId = hasAppleIdArgs(args);
  if (usingApi && usingAppleId) {
    throw new Error('choose either App Store Connect API options or Apple ID options, not both');
  }
  if (usingApi) {
    requireAll(args, ['apiKey', 'apiIssuer', 'apiKeyFile'], 'App Store Connect API notarization');
  } else if (usingAppleId) {
    requireAll(args, ['appleIdFile', 'applePasswordFile', 'appleTeamId'], 'Apple ID notarization');
  } else {
    throw new Error('notarization credentials are required; pass App Store Connect API options or Apple ID options');
  }
  return { usingApi };
}

async function buildSecrets(args) {
  const { usingApi } = validateNotarizationArgs(args);

  const secrets = [
    ['APPLE_CERTIFICATE', await readBase64File(path.resolve(args.certificate), 'Developer ID certificate')],
    ['APPLE_CERTIFICATE_PASSWORD', await readTrimmedFile(path.resolve(args.certificatePasswordFile), 'Developer ID certificate password')],
    ['KEYCHAIN_PASSWORD', await valueFromFileOrGenerated(args.keychainPasswordFile, 'temporary keychain password')]
  ];

  if (usingApi) {
    secrets.push(
      ['APPLE_API_KEY', args.apiKey],
      ['APPLE_API_ISSUER', args.apiIssuer],
      ['APPLE_API_KEY_P8', await readTrimmedFile(path.resolve(args.apiKeyFile), 'App Store Connect API private key')]
    );
  } else {
    secrets.push(
      ['APPLE_ID', await readTrimmedFile(path.resolve(args.appleIdFile), 'Apple ID email')],
      ['APPLE_PASSWORD', await readTrimmedFile(path.resolve(args.applePasswordFile), 'Apple ID app-specific password')],
      ['APPLE_TEAM_ID', args.appleTeamId]
    );
  }

  return secrets;
}

if (isMain) {
  const repo = args.repo || originRepo();

  try {
    requireGhAndRepo(repo);
    const secrets = await buildSecrets(args);

    if (args.dryRun) {
      console.log(`macOS notarization secret dry run passed for ${repo}: ${secrets.map(([name]) => name).join(', ')}.`);
      process.exit(0);
    }

    for (const [name, value] of secrets) {
      setSecret({ repo, name, value });
    }

    console.log(`Uploaded macOS Developer ID notarization secrets to ${repo}.`);
  } catch (error) {
    console.error(`Failed to set macOS notarization secrets: ${error.message}`);
    process.exit(1);
  }
}

export {
  parseArgs,
  validateNotarizationArgs
};
