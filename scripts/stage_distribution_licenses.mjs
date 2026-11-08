import { mkdir, readFile, writeFile, cp, rm, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  createManifest,
  filesBelow,
  htmlEscape,
  sha256,
} from "./lib/distribution_licenses.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = path.join(root, "src-tauri/resources/licenses");
const sources = path.join(root, ".compliance/sources");
const release = process.argv.includes("--release");
const pack = process.argv.includes("--sources");
const platform = {
  darwin: "macos-aarch64",
  win32: "windows-x86_64",
  linux: "linux-x86_64",
}[process.platform];
if (!platform) throw new Error("Unsupported platform");
const version = JSON.parse(
  await readFile(path.join(root, "package.json")),
).version;
const identity = { version, platform };
if (release || pack) {
  await rm(out, { recursive: true, force: true });
  await rm(sources, { recursive: true, force: true });
}
await mkdir(out, { recursive: true });
async function copy(from, to) {
  await mkdir(path.dirname(to), { recursive: true });
  await cp(from, to, { recursive: true, dereference: false });
}
const staticFiles = {
  "ASCII-VJ-Remix-LICENSE.txt": "LICENSE",
  "Unifont-LICENSE.txt": "third_party/unifont/LICENSE.txt",
  "Unifont-OFL-1.1.txt": "third_party/unifont/OFL-1.1.txt",
  "Unifont-COPYING.txt": "third_party/unifont/COPYING",
  "Unifont-README.txt": "third_party/unifont/UPSTREAM-README",
  "VCR-OSD-Mono-NOTICE.md": "third_party/vcr-osd-mono/NOTICE.md",
  "Public-domain-demo-footage.md": "media/PUBLIC-DOMAIN.md",
  "Platform-LICENSE.txt": "shared/dust-wave-platform/LICENSE",
  "Platform-desktop-NOTICE.txt":
    "shared/dust-wave-platform/packages/desktop-core/NOTICE",
  "NDI-NOTICE.md": "src-tauri/resources/video-io/NOTICE.md",
  "Syphon-LICENSE.txt": "src-tauri/resources/video-io/SYPHON-LICENSE.txt",
  "FFmpeg-LGPL-2.1.txt": "third_party/ffmpeg/COPYING.LGPLv2.1",
  "FFmpeg-LICENSE.md": "third_party/ffmpeg/LICENSE.md",
  "FFmpeg-NOTICE.md": "third_party/ffmpeg/NOTICE.md",
};
for (const [name, source] of Object.entries(staticFiles))
  await copy(path.join(root, source), path.join(out, name));
const ndiNotice = path.join(
  root,
  "src-tauri/resources/video-io",
  platform,
  "NDI-THIRD-PARTY-LICENSES.txt",
);
try {
  await copy(ndiNotice, path.join(out, "NDI-THIRD-PARTY-LICENSES.txt"));
} catch (error) {
  if (release || pack || error.code !== "ENOENT") throw error;
}
const catalog = [];
if (release || pack) {
  const host = execFileSync("rustc", ["-vV"], { encoding: "utf8" }).match(
    /^host: (.+)$/m,
  )?.[1];
  const metadata = JSON.parse(
    execFileSync(
      "cargo",
      [
        "metadata",
        "--manifest-path",
        path.join(root, "src-tauri/Cargo.toml"),
        "--locked",
        "--format-version",
        "1",
        "--filter-platform",
        host,
      ],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    ),
  );
  async function dependency(name, version, dir, license) {
    if (!license) throw new Error(`Unreviewed dependency license: ${name}`);
    const id = `${name.replace(/[^a-z0-9_.-]/gi, "_")}-${version}`;
    // Registry packages only: no application files, credentials or local SDKs.
    const dest = path.join(sources, "dependencies", id);
    await copy(dir, dest);
    const names = await filesBelow(dest);
    const notices = names.filter((n) =>
      /^(license|licence|copying|notice|copyright|authors)([._-]|$)/i.test(
        path.basename(n),
      ),
    );
    for (const n of notices)
      await copy(path.join(dest, n), path.join(out, "dependencies", id, n));
    catalog.push({
      name,
      version,
      license,
      notices,
      source: `dependencies/${id}`,
    });
  }
  for (const p of metadata.packages) {
    if (!p.source?.startsWith("registry+")) continue;
    await dependency(
      p.name,
      p.version,
      path.dirname(p.manifest_path),
      p.license,
    );
  }
  const visited = new Set();
  async function npmDependency(name, from) {
    const { createRequire } = await import("node:module");
    const req = createRequire(path.join(from, "package.json"));
    let manifestPath;
    try {
      manifestPath = req.resolve(`${name}/package.json`);
    } catch {
      let dir = path.dirname(req.resolve(name));
      while (true) {
        const candidate = path.join(dir, "package.json");
        try {
          if (JSON.parse(await readFile(candidate)).name === name) {
            manifestPath = candidate;
            break;
          }
        } catch {}
        const parent = path.dirname(dir);
        if (parent === dir)
          throw new Error(`Cannot locate package metadata: ${name}`);
        dir = parent;
      }
    }
    if (visited.has(manifestPath)) return;
    visited.add(manifestPath);
    const p = JSON.parse(await readFile(manifestPath));
    await dependency(p.name, p.version, path.dirname(manifestPath), p.license);
    for (const child of Object.keys(p.dependencies || {}))
      await npmDependency(child, path.dirname(manifestPath));
  }
  const npm = JSON.parse(await readFile(path.join(root, "package.json")));
  for (const name of Object.keys(npm.dependencies || {}))
    await npmDependency(name, root);
  await copy(
    path.join(root, "third_party/unifont"),
    path.join(sources, "unifont"),
  );
  await copy(
    path.join(root, "third_party/ffmpeg"),
    path.join(sources, "build/third_party/ffmpeg"),
  );
  for (const name of ["Cargo.lock", "Cargo.toml"])
    await copy(
      path.join(root, "src-tauri", name),
      path.join(sources, "build/src-tauri", name),
    );
  for (const name of ["package.json", "package-lock.json"])
    await copy(
      path.join(root, name),
      path.join(sources, "build/src-tauri", name),
    );
  for (const name of [
    "build_ffmpeg_sidecar.sh",
    "stage_ffmpeg_sidecars.mjs",
    "stage_ffmpeg_sources.mjs",
    "stage_distribution_licenses.mjs",
  ])
    await copy(
      path.join(root, "scripts", name),
      path.join(sources, "build/scripts", name),
    );
  await copy(
    path.join(root, "scripts/lib"),
    path.join(sources, "build/scripts/lib"),
  );
  await copy(
    path.join(root, "src-tauri/tauri.conf.json"),
    path.join(sources, "build/src-tauri/tauri.conf.json"),
  );
  await writeFile(
    path.join(out, "dependency-catalog.json"),
    JSON.stringify(
      {
        scope:
          "Conservative resolved dependency superset, including build tools; individual licenses remain authoritative.",
        ...identity,
        cargoLockSha256: sha256(
          await readFile(path.join(root, "src-tauri/Cargo.lock")),
        ),
        npmLockSha256: sha256(
          await readFile(path.join(root, "package-lock.json")),
        ),
        packages: catalog,
      },
      null,
      2,
    ) + "\n",
  );
}
const archiveName = `ascii-vj-remix-${version}-${platform}-sources.tar.gz`;
const sourceUrl = `https://github.com/aindaco1/ascii-vj-remix/releases/download/v${version}/${archiveName}`;
await writeFile(
  path.join(out, "SOURCES.md"),
  `# Component sources\n\nRelease ${version}, ${platform}.\n\nCorresponding dependency source archive: ${sourceUrl}\n\n${platform === "linux-x86_64" ? `Native library sources: https://github.com/aindaco1/ascii-vj-remix/releases/download/v${version}/ascii-vj-remix-${version}-linux-x86_64-native-sources.tar.gz\n\n` : ""}FFmpeg complete source and build inputs also accompany its sidecars in resources/ffmpeg/${platform}/source/.\n\nSources and component rights do not expire with update/support coverage. This notice is not a three-year written offer. The release must supply the stated files before publication.\n`,
);
const textNames = (await filesBelow(out)).filter(
  (n) => !["manifest.json", "index.html", "style.css"].includes(n),
);
await copy(path.join(root, "renderers/desktop/distribution-licenses.css"), path.join(out, "style.css"));
let html =
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;self&#39;"><title>Software licenses — ASCII VJ Remix</title><link rel="stylesheet" href="/licenses/style.css"><h1>Software licenses</h1><p>Original component terms apply. Update/support expiry does not remove component rights.</p>';
for (const n of textNames)
  html += `<details><summary>${htmlEscape(n)}</summary><pre>${htmlEscape(
    await readFile(path.join(out, n), "utf8"),
  )
    .replaceAll(":", "&#58;")
    .replaceAll("/", "&#47;")}</pre></details>`;
await writeFile(path.join(out, "index.html"), html + "</html>\n");
await writeFile(
  path.join(out, "manifest.json"),
  JSON.stringify(
    await createManifest(
      out,
      await filesBelow(out).then((ns) =>
        ns.filter((n) => n !== "manifest.json"),
      ),
      identity,
    ),
    null,
    2,
  ) + "\n",
);
if (pack) {
  const ffmpeg = path.join(
    root,
    "src-tauri/resources/ffmpeg",
    platform,
    "source",
  );
  await copy(ffmpeg, path.join(sources, "ffmpeg"));
  await copy(out, path.join(sources, "notices"));
  await writeFile(
    path.join(sources, "README.md"),
    "# Corresponding component sources\n\nOriginal licenses are in the component directories and notices. Registry packages are complete source snapshots from the locked build. FFmpeg source, configure output and build scripts are included. Sources cover components, not proprietary NDI code.\n\nTo rebuild FFmpeg: install Node plus a C compiler, make, tar/xz and nasm (Xcode command tools on Mac; MSYS2 UCRT64 on Windows; build-essential on Linux). Copy ffmpeg/ffmpeg-VERSION.tar.xz into a writable directory, set ASCILINE_FFMPEG_BUILD_DIR to that directory, then run bash build/scripts/build_ffmpeg_sidecar.sh. It verifies and reuses the supplied archive. Exact flags are in ffmpeg/buildconf.txt; toolchain/platform identity is in ffmpeg/build-environment.json. No NDI SDK is needed. The separately executable FFmpeg tools can be modified/rebuilt; their rights do not depend on an update subscription.\n",
  );
  const manifest = await createManifest(
    sources,
    await filesBelow(sources),
    identity,
  );
  await writeFile(
    path.join(sources, "source-manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  const artifacts = path.join(root, ".compliance/artifacts");
  await mkdir(artifacts, { recursive: true });
  execFileSync(
    "tar",
    ["-czf", path.join(artifacts, archiveName), "-C", sources, "."],
    { stdio: "inherit" },
  );
  const bytes = await readFile(path.join(artifacts, archiveName));
  await writeFile(
    path.join(artifacts, `${archiveName}.json`),
    JSON.stringify(
      {
        ...identity,
        file: archiveName,
        bytes: bytes.length,
        sha256: sha256(bytes),
      },
      null,
      2,
    ) + "\n",
  );
}
console.log(
  `Staged local license resources for ${platform}; ${catalog.length} dependency source packages${pack ? "; source archive created" : ""}.`,
);
