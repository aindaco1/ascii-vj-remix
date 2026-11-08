import { readFile, readdir, mkdir, mkdtemp, rm, cp } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { tauriTargetDir } from "./lib/tauri_target_dir.mjs";
import {
  verifyManifest,
  verifySourceBundle,
  filesBelow,
  sha256,
} from "./lib/distribution_licenses.mjs";
const root = fileURLToPath(new URL("..", import.meta.url));
const profile = "release",
  sourceOut = path.join(root, ".compliance/artifacts");
const licenses = path.join(root, "src-tauri/resources/licenses");
const manifest = JSON.parse(
  await readFile(path.join(licenses, "manifest.json")),
);
await verifyManifest(licenses, manifest);
const catalog = JSON.parse(
  await readFile(path.join(licenses, "dependency-catalog.json")),
);
if (
  catalog.cargoLockSha256 !==
    sha256(await readFile(path.join(root, "src-tauri/Cargo.lock"))) ||
  catalog.npmLockSha256 !==
    sha256(await readFile(path.join(root, "package-lock.json")))
)
  throw new Error("Dependency notices are stale");
const artifactNames = [
  `ascii-vj-remix-${manifest.version}-${manifest.platform}-sources.tar.gz`,
];
if (process.platform === "linux")
  artifactNames.push(
    `ascii-vj-remix-${manifest.version}-${manifest.platform}-native-sources.tar.gz`,
  );
const temp = await mkdtemp(path.join(os.tmpdir(), "ascii-distribution-"));
try {
  for (const [index, artifactName] of artifactNames.entries()) {
    const info = JSON.parse(
      await readFile(path.join(sourceOut, `${artifactName}.json`)),
    );
    if (
      info.file !== artifactName ||
      info.version !== manifest.version ||
      info.platform !== manifest.platform ||
      info.sha256 !== sha256(await readFile(path.join(sourceOut, artifactName)))
    )
      throw new Error("Source archive identity/digest mismatch");
    const src = path.join(temp, `source-${index}`);
    await mkdir(src);
    execFileSync("tar", [
      "-xzf",
      path.join(sourceOut, artifactName),
      "-C",
      src,
    ]);
    await verifySourceBundle(
      src,
      JSON.parse(await readFile(path.join(src, "source-manifest.json"))),
      manifest,
    );
  }
  console.log(
    "Corresponding source archive contents and release identity verified.",
  );
  if (!process.argv.includes("--sources-only")) {
    const bundle = path.join(tauriTargetDir(root), profile, "bundle");
    // Unlike source traversal, app bundles may contain legitimate framework symlinks.
    async function regularFiles(dir) {
      const out = [];
      for (const e of await readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...(await regularFiles(p)));
        else if (e.isFile()) out.push(p);
      }
      return out;
    }
    const archives = (await regularFiles(bundle)).filter((n) =>
      /\.(dmg|app\.tar\.gz|exe|msi|deb|rpm|AppImage)$/.test(n),
    );
    const expected = {
      darwin: [".dmg", ".app.tar.gz"],
      win32: [".exe", ".msi"],
      linux: [".deb", ".rpm", ".AppImage"],
    }[process.platform];
    for (const suffix of expected)
      if (!archives.some((n) => n.endsWith(suffix)))
        throw new Error(`Missing installer ${suffix}`);
    const sevenzip =
      process.env.ASCII_SEVENZIP ||
      (process.platform === "win32"
        ? "C:\\Program Files\\7-Zip\\7z.exe"
        : "7zz");
    for (const [i, archive] of archives.entries()) {
      const dest = path.join(temp, `archive-${i}`);
      await mkdir(dest);
      if (archive.endsWith(".app.tar.gz"))
        execFileSync("tar", ["-xzf", archive, "-C", dest]);
      else
        execFileSync(sevenzip, ["x", "-y", `-o${dest}`, archive], {
          stdio: "pipe",
        });
      // RPM/DEB/DMG containers can expose a nested filesystem archive.
      for (let pass = 0; pass < 3; pass++) {
        const nested = (await regularFiles(dest)).filter((p) =>
          /\.(cpio|tar|tar\.xz|tar\.gz|tar\.zst|cab|hfs)$/.test(p),
        );
        if (!nested.length) break;
        for (const [j, p] of nested.entries()) {
          const to = `${p}.unpacked`;
          await mkdir(to, { recursive: true });
          execFileSync(sevenzip, ["x", "-y", `-o${to}`, p], { stdio: "pipe" });
          await rm(p);
        }
      }
      const files = await regularFiles(dest),
        hashes = new Set();
      for (const p of files) {
        const { stat } = await import("node:fs/promises");
        if ((await stat(p)).size <= 20 * 1024 * 1024)
          hashes.add(sha256(await readFile(p)));
      }
      // Content validation also handles MSI's opaque cabinet names.
      for (const f of manifest.files)
        if (!hashes.has(f.sha256))
          throw new Error(
            `${path.basename(archive)} missing/changed legal resource: ${f.path}`,
          );
      if (archive.endsWith(".AppImage")) {
        const evidence = JSON.parse(await readFile(path.join(root, "third_party/appimage-runtime/evidence.json")));
        const offset = Number(execFileSync(archive, ["--appimage-offset"], { encoding: "utf8" }).trim());
        const bytes = await readFile(archive);
        if (!Number.isSafeInteger(offset) || offset <= 0 || offset >= bytes.length || sha256(bytes.subarray(0, offset)) !== evidence.runtimeSha256) {
          throw new Error("Final AppImage runtime differs from reviewed source provenance");
        }
        const native = JSON.parse(
          await readFile(path.join(licenses, "native-system-catalog.json")),
        );
        for (const p of files.filter((p) =>
          /\.so(?:\.|$)/.test(path.basename(p)),
        )) {
          if (path.basename(p).startsWith("libndi")) continue;
          const hash = sha256(await readFile(p));
          if (!native.files.some((f) => f.sha256 === hash))
            throw new Error(`Unrecorded AppImage library: ${path.basename(p)}`);
        }
      }
      console.log(`License payload verified: ${path.basename(archive)}`);
    }
    const target = path.join(tauriTargetDir(root), profile, "release-assets");
    await mkdir(target, { recursive: true });
    for (const f of artifactNames.flatMap((n) => [n, `${n}.json`]))
      await cp(path.join(sourceOut, f), path.join(target, f));
  }
} finally {
  await rm(temp, { recursive: true, force: true });
}
