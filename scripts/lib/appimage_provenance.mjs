import { readFile } from "node:fs/promises";
import path from "node:path";
import { sha256 } from "./distribution_licenses.mjs";

export function verifyAppImageRuntime({ image, offset, evidence, sources, inputs }) {
  if (evidence.schema !== 1 || evidence.inputsSha256 !== sha256(inputs)) {
    throw new Error("AppImage runtime build inputs changed or are unreviewed");
  }
  if (!Number.isSafeInteger(offset) || offset <= 0 || offset >= image.length ||
      sha256(image.subarray(0, offset)) !== evidence.runtimeSha256) {
    throw new Error("AppImage runtime does not match its corresponding source build");
  }
  if (sha256(sources) !== evidence.sourceSha256) {
    throw new Error("AppImage runtime source archive missing or changed");
  }
  const packages = new Set(evidence.staticPackages?.map(p => p.origin));
  for (const name of ["musl", "zstd", "zlib", "mimalloc", "gcc"]) {
    if (!packages.has(name)) throw new Error(`Missing static runtime source: ${name}`);
  }
}

export async function inspectAppImageRuntime(root, image, offset) {
  const directory = path.join(root, ".compliance/appimage-runtime");
  const evidence = JSON.parse(await readFile(path.join(directory, "evidence.json")));
  verifyAppImageRuntime({ image, offset, evidence,
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
