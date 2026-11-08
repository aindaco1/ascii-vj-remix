import { readFile } from "node:fs/promises";
import path from "node:path";
import { sha256 } from "./distribution_licenses.mjs";

// This release ships ELF64 little-endian x86_64. Read metadata from the hashed
// source-built runtime, never from the packaged image being checked.
function digestSection(runtime) {
  if (runtime.length < 64 || !isElf(runtime) || runtime[4] !== 2 || runtime[5] !== 1 || runtime.readUInt16LE(18) !== 62)
    throw new Error("Unsupported AppImage runtime ELF format");
  const table = Number(runtime.readBigUInt64LE(40));
  const stride = runtime.readUInt16LE(58), count = runtime.readUInt16LE(60), namesIndex = runtime.readUInt16LE(62);
  if (!Number.isSafeInteger(table) || stride !== 64 || count < 1 || namesIndex >= count || table + stride * count > runtime.length)
    throw new Error("Invalid AppImage runtime ELF sections");
  function section(index) {
    const start = table + index * stride;
    const offset = Number(runtime.readBigUInt64LE(start + 24)), length = Number(runtime.readBigUInt64LE(start + 32));
    return { start, offset, length };
  }
  function bytes({ offset, length }) {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset + length > runtime.length)
      throw new Error("AppImage runtime section exceeds file");
    return runtime.subarray(offset, offset + length);
  }
  const names = bytes(section(namesIndex)), matches = [];
  for (let i = 0; i < count; i++) {
    const s = section(i), name = runtime.readUInt32LE(s.start), end = names.indexOf(0, name);
    if (name >= names.length || end < name) throw new Error("Invalid AppImage runtime section name");
    if (names.subarray(name, end).toString() === ".digest_md5") matches.push(s);
  }
  if (matches.length !== 1 || matches[0].length !== 16 || bytes(matches[0]).some(byte => byte !== 0))
    throw new Error("Unexpected AppImage runtime digest section");
  return matches[0];
}

export function verifyAppImageRuntime({ image, offset, runtime, evidence, sources, inputs }) {
  if (evidence.schema !== 1 || evidence.inputsSha256 !== sha256(inputs)) {
    throw new Error("AppImage runtime build inputs changed or are unreviewed");
  }
  if (!Buffer.isBuffer(runtime) || sha256(runtime) !== evidence.runtimeSha256 ||
      !Number.isSafeInteger(offset) || offset !== runtime.length || offset >= image.length) {
    throw new Error("AppImage runtime does not match its corresponding source build");
  }
  // appimagetool 8c8c91f writes only its format checksum into this 16-byte
  // section. Preserve byte-for-byte checking of all executable code and other
  // metadata; the complete installer is separately hashed and updater-signed.
  const digest = digestSection(runtime), packaged = Buffer.from(image.subarray(0, offset));
  packaged.fill(0, digest.offset, digest.offset + digest.length);
  if (sha256(packaged) !== evidence.runtimeSha256) {
    throw new Error("AppImage runtime does not match its corresponding source build");
  }
  if (sha256(sources) !== evidence.sourceSha256) {
    throw new Error("AppImage runtime source archive missing or changed");
  }
  const packages = new Set(evidence.staticPackages?.map(p => p.component));
  for (const name of ["musl", "zstd", "zlib", "mimalloc", "gcc"]) {
    if (!packages.has(name)) throw new Error(`Missing static runtime source: ${name}`);
  }
}

export async function inspectAppImageRuntime(root, image, offset) {
  const directory = path.join(root, ".compliance/appimage-runtime");
  const evidence = JSON.parse(await readFile(path.join(directory, "evidence.json")));
  verifyAppImageRuntime({ image, offset, evidence,
    runtime: await readFile(path.join(directory, "runtime-x86_64")),
    sources: await readFile(path.join(root, ".compliance/runtime-sources.tar.gz")),
    inputs: await readFile(path.join(root, "third_party/appimage-runtime/inputs.json")),
  });
  return evidence;
}

export function isElf(bytes) {
  return bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
}

// These have independent app/FFmpeg/NDI source and component-notice gates.
export function separatelyCoveredElf(relative) {
  return /(?:^|\/)usr\/bin\/ascii-vj-remix$/.test(relative) ||
    /\/ffmpeg\/linux-x86_64\/bin\/(ffmpeg|ffprobe)$/.test(relative) ||
    /^libndi\.so(?:\.|$)/.test(path.basename(relative));
}
