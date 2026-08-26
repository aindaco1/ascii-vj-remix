import { chmod, copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

async function sha256(filePath) {
  const bytes = await readFile(filePath);
  return createHash('sha256').update(bytes).digest('hex');
}

function validateIdentity(value, label) {
  const normalized = String(value || '').trim();
  if (!normalized || /[\r\n]/.test(normalized)) throw new Error(`${label} is required`);
  return normalized;
}

function validateReleaseIdentity(options) {
  const commit = validateIdentity(options.commit, 'commit');
  const platform = validateIdentity(options.platform, 'platform');
  const version = validateIdentity(options.version, 'version');
  if (!/^[0-9a-f]{40}$/i.test(commit)) throw new Error('commit must be a full 40-character Git commit');
  if (!/^(macos|windows|linux)-(aarch64|x86_64)$/.test(platform)) {
    throw new Error(`unsupported release platform: ${platform}`);
  }
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`invalid release version: ${version}`);
  }
  return { commit, platform, version };
}

async function packReleaseBinary(options) {
  const binaryPath = path.resolve(validateIdentity(options.binary, 'binary path'));
  const outputDir = path.resolve(validateIdentity(options.outputDir, 'output directory'));
  const { commit, platform, version } = validateReleaseIdentity(options);
  const metadata = await stat(binaryPath);
  if (!metadata.isFile()) throw new Error(`release binary is not a file: ${binaryPath}`);

  await mkdir(outputDir, { recursive: false });
  const file = path.basename(binaryPath);
  const outputBinary = path.join(outputDir, file);
  await copyFile(binaryPath, outputBinary);
  const manifest = {
    schema: 1,
    commit,
    platform,
    version,
    binary: {
      file,
      bytes: metadata.size,
      sha256: await sha256(outputBinary)
    }
  };
  await writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function restoreReleaseBinary(options) {
  const inputDir = path.resolve(validateIdentity(options.inputDir, 'input directory'));
  const outputPath = path.resolve(validateIdentity(options.output, 'output path'));
  const expected = validateReleaseIdentity(options);
  const manifest = JSON.parse(await readFile(path.join(inputDir, 'manifest.json'), 'utf8'));
  if (manifest.schema !== 1) throw new Error(`unsupported release binary manifest schema: ${manifest.schema}`);
  for (const [key, value] of Object.entries(expected)) {
    if (manifest[key] !== value) {
      throw new Error(`release binary ${key} mismatch: expected ${value}, found ${manifest[key] || '(missing)'}`);
    }
  }
  const file = manifest.binary?.file;
  if (!file || path.basename(file) !== file) throw new Error('release binary manifest contains an unsafe file name');
  const sourcePath = path.join(inputDir, file);
  const metadata = await stat(sourcePath);
  if (!metadata.isFile()) throw new Error(`release binary payload is not a file: ${sourcePath}`);
  if (metadata.size !== manifest.binary.bytes) {
    throw new Error(`release binary byte size mismatch: expected ${manifest.binary.bytes}, found ${metadata.size}`);
  }
  const actualHash = await sha256(sourcePath);
  if (actualHash !== manifest.binary.sha256) {
    throw new Error(`release binary hash mismatch: expected ${manifest.binary.sha256}, found ${actualHash}`);
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await copyFile(sourcePath, outputPath);
  if (!outputPath.toLowerCase().endsWith('.exe')) await chmod(outputPath, 0o755);
  return manifest;
}

export {
  packReleaseBinary,
  restoreReleaseBinary
};
