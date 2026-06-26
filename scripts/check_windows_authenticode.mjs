#!/usr/bin/env node
import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tauriTargetDir } from './lib/tauri_target_dir.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = parseArgs(process.argv.slice(2));
const profile = args.profile || process.env.ASCILINE_TAURI_PROFILE || 'release';
const bundleRoot = path.join(tauriTargetDir(root), profile, 'bundle');
const issues = [];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`unexpected argument: ${arg}`);
    const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${arg}`);
    out[key] = value;
    i += 1;
  }
  return out;
}

async function filesRecursive(parent) {
  const out = [];
  async function visit(dir) {
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(filePath);
      } else if (entry.isFile()) {
        out.push(filePath);
      }
    }
  }
  await visit(parent);
  return out;
}

function powershell() {
  return process.platform === 'win32' ? 'powershell' : '';
}

function signatureFor(filePath) {
  const command = powershell();
  if (!command) throw new Error('Windows Authenticode check can only run on Windows.');

  const script = [
    '$ErrorActionPreference = "Stop"',
    '$signature = Get-AuthenticodeSignature -LiteralPath $env:ASCILINE_SIGNATURE_FILE',
    '[PSCustomObject]@{',
    'Status = [string]$signature.Status',
    'StatusMessage = [string]$signature.StatusMessage',
    'SignerSubject = if ($signature.SignerCertificate) { [string]$signature.SignerCertificate.Subject } else { "" }',
    'TimeStamperSubject = if ($signature.TimeStamperCertificate) { [string]$signature.TimeStamperCertificate.Subject } else { "" }',
    '} | ConvertTo-Json -Compress'
  ].join('\n');

  const result = spawnSync(command, ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    encoding: 'utf8',
    env: { ...process.env, ASCILINE_SIGNATURE_FILE: filePath }
  });
  const text = `${result.stdout || ''}${result.stderr || ''}`.trim();
  if (result.status !== 0) {
    throw new Error(text || `Get-AuthenticodeSignature failed with status ${result.status}`);
  }
  return JSON.parse(result.stdout);
}

if (process.platform !== 'win32') {
  console.error('Windows Authenticode check can only run on Windows.');
  process.exit(1);
}

const artifactFiles = (await filesRecursive(bundleRoot))
  .filter((file) => /\.(exe|msi)$/i.test(file))
  .sort();

if (artifactFiles.length === 0) {
  issues.push(`no Windows .exe or .msi artifacts found under ${path.relative(root, bundleRoot)}`);
}

for (const filePath of artifactFiles) {
  let signature;
  try {
    signature = signatureFor(filePath);
  } catch (error) {
    issues.push(`${path.relative(root, filePath)} signature could not be read: ${error.message}`);
    continue;
  }
  if (signature.Status !== 'Valid') {
    issues.push(`${path.relative(root, filePath)} Authenticode status is ${signature.Status}: ${signature.StatusMessage || 'no status message'}`);
  }
  if (!signature.SignerSubject) {
    issues.push(`${path.relative(root, filePath)} is missing a signer certificate`);
  }
  if (!signature.TimeStamperSubject) {
    issues.push(`${path.relative(root, filePath)} is missing an Authenticode timestamp`);
  }
}

if (issues.length > 0) {
  console.error('Windows Authenticode check failed:');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(`Windows Authenticode check passed for ${artifactFiles.length} ${profile} artifact(s).`);
