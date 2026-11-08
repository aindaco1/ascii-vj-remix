import { readFile, writeFile, mkdir, cp } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  sha256,
  createManifest,
  filesBelow,
} from "./lib/distribution_licenses.mjs";
const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const archive = args[args.indexOf("--archive") + 1];
if (!args.includes("--archive") || !archive)
  throw new Error("--archive is required");
const platform = {
  darwin: "macos-aarch64",
  win32: "windows-x86_64",
  linux: "linux-x86_64",
}[process.platform];
const runtime = path.join(root, "src-tauri/resources/ffmpeg", platform);
const meta = JSON.parse(await readFile(path.join(runtime, "manifest.json")));
const script = await readFile(
  path.join(root, "scripts/build_ffmpeg_sidecar.sh"),
  "utf8",
);
const version = script.match(
  /VERSION="\$\{ASCILINE_FFMPEG_VERSION:-([^}]+)\}"/,
)[1];
const expected = script.match(
  /SHA256="\$\{ASCILINE_FFMPEG_SHA256:-([a-f0-9]{64})\}"/,
)[1];
if (process.env.ASCILINE_FFMPEG_VERSION || process.env.ASCILINE_FFMPEG_SHA256)
  throw new Error(
    "Custom FFmpeg sources require an explicit reviewed source pin change",
  );
if (sha256(await readFile(archive)) !== expected)
  throw new Error("FFmpeg source hash mismatch");
if (
  !meta.files.every((f) =>
    new RegExp(
      "^ff(?:mpeg|probe) version " + version.replaceAll(".", "\\.") + "(?: |$)",
    ).test(f.version),
  )
)
  throw new Error("FFmpeg source/binary version mismatch");
const out = path.join(runtime, "source");
await mkdir(out, { recursive: true });
await cp(archive, path.join(out, `ffmpeg-${version}.tar.xz`));
await cp(
  path.join(root, "scripts/build_ffmpeg_sidecar.sh"),
  path.join(out, "build_ffmpeg_sidecar.sh"),
);
for (const file of ["COPYING.LGPLv2.1", "LICENSE.md"])
  await cp(
    path.join(root, "third_party/ffmpeg", file),
    path.join(runtime, file),
  );
const binary = path.join(
  runtime,
  "bin",
  process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
);
const result = spawnSync(binary, ["-buildconf"], { encoding: "utf8" });
if (result.status !== 0)
  throw new Error("Cannot capture FFmpeg configure record");
const conf = result.stdout + result.stderr;
if (
  !conf.includes("--disable-network") ||
  !conf.includes("--disable-autodetect")
)
  throw new Error("Missing FFmpeg configure record");
const compiler = spawnSync(process.env.CC || "cc", ["--version"], {
  encoding: "utf8",
});
await writeFile(
  path.join(out, "build-environment.json"),
  JSON.stringify(
    {
      platform,
      os: (await import("node:os")).release(),
      node: process.version,
      compiler: compiler.stdout || compiler.stderr,
    },
    null,
    2,
  ) + "\n",
);
await writeFile(path.join(out, "buildconf.txt"), conf);
await writeFile(
  path.join(out, "runtime-manifest.json"),
  JSON.stringify(meta, null, 2) + "\n",
);
await writeFile(
  path.join(out, "manifest.json"),
  JSON.stringify(
    await createManifest(
      out,
      (await filesBelow(out)).filter((n) => n !== "manifest.json"),
      { version, platform, upstreamSha256: expected },
    ),
    null,
    2,
  ) + "\n",
);
console.log("FFmpeg corresponding source and build record staged.");
