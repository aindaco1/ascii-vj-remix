// Run on the same Ubuntu packaging host, after the first AppImage bundle.
import { execFileSync } from "node:child_process";
import {
  mkdir,
  readFile,
  writeFile,
  cp,
  readdir,
  mkdtemp,
  rm,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  sha256,
  createManifest,
  filesBelow,
} from "./lib/distribution_licenses.mjs";
import { tauriTargetDir } from "./lib/tauri_target_dir.mjs";
if (process.platform !== "linux")
  throw new Error("Native Linux source capture requires the packaging host");
const root = fileURLToPath(new URL("..", import.meta.url)),
  out = path.join(root, "src-tauri/resources/licenses");
const bundle = path.join(tauriTargetDir(root), "release/bundle/appimage");
const images = (await readdir(bundle)).filter((n) => n.endsWith(".AppImage"));
if (images.length !== 1) throw new Error("Expected one AppImage");
const temp = await mkdtemp(path.join(os.tmpdir(), "ascii-native-sources-"));
const source = path.join(root, ".compliance/native-sources");
await rm(source, { recursive: true, force: true });
await mkdir(source, { recursive: true });
const run = (command, args, options = {}) =>
  execFileSync(command, args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
const packages = new Map(),
  files = [];
try {
  run(process.env.ASCII_SEVENZIP || "7zz", [
    "x",
    "-y",
    `-o${temp}`,
    path.join(bundle, images[0]),
  ]);
  // The AppImage ELF runtime sits OUTSIDE its squashfs library inventory. Its
  // statically linked libraries need a separate, reviewed source/build bundle.
  const runtimeEvidence = path.join(
    root,
    "third_party/appimage-runtime/evidence.json",
  );
  let evidence;
  try {
    evidence = JSON.parse(await readFile(runtimeEvidence));
  } catch {
    throw new Error(
      "AppImage runtime source provenance missing; see third_party/appimage-runtime/README.md",
    );
  }
  const image = path.join(bundle, images[0]);
  const offset = Number(run(image, ["--appimage-offset"]).trim());
  const bytes = await readFile(image);
  if (
    !Number.isSafeInteger(offset) ||
    offset <= 0 ||
    offset >= bytes.length ||
    sha256(bytes.subarray(0, offset)) !== evidence.runtimeSha256
  )
    throw new Error(
      "AppImage runtime does not match reviewed source provenance",
    );
  const runtimeSources = path.join(root, ".compliance/runtime-sources.tar.gz");
  if (
    !evidence.sourceSha256 ||
    sha256(await readFile(runtimeSources)) !== evidence.sourceSha256
  )
    throw new Error(
      "Reviewed AppImage runtime source archive missing or changed",
    );
  await cp(
    runtimeSources,
    path.join(source, "appimage-runtime-sources.tar.gz"),
  );
  await cp(
    runtimeEvidence,
    path.join(source, "appimage-runtime-evidence.json"),
  );
  await cp(
    path.join(root, "third_party/appimage-runtime/notices"),
    path.join(out, "native/appimage-runtime"),
    { recursive: true },
  );
  async function scan(dir) {
    const r = [];
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) r.push(...(await scan(p)));
      else if (e.isFile()) r.push(p);
    }
    return r;
  }
  for (const file of (await scan(temp)).filter((p) =>
    /\.so(?:\.|$)/.test(path.basename(p)),
  )) {
    const name = path.basename(file);
    if (name.startsWith("libndi")) continue;
    const matches = run("dpkg-query", ["-S", `*/${name}`])
      .trim()
      .split("\n");
    const owners = matches
      .map((s) => s.match(/^(.+?): (\/.*)$/))
      .filter(Boolean);
    if (!owners.length)
      throw new Error(`No package source provenance for ${name}`);
    // Every candidate must resolve to the same source version; ambiguity fails closed.
    const origins = owners.map((m) =>
      run("dpkg-query", [
        "-W",
        "-f=${source:Package}\t${source:Version}\t${binary:Package}",
        m[1],
      ]).split("\t"),
    );
    if (new Set(origins.map(([p, v]) => `${p}=${v}`)).size !== 1)
      throw new Error(`Ambiguous package provenance: ${name}`);
    const [pkg, version, binary] = origins[0];
    packages.set(`${pkg}=${version}`, { pkg, version, binary });
    files.push({
      file: path.relative(temp, file),
      sha256: sha256(await readFile(file)),
      sourcePackage: pkg,
      sourceVersion: version,
    });
  }
  for (const [id, p] of packages) {
    const dir = path.join(source, p.pkg);
    await mkdir(dir, { recursive: true });
    run("apt-get", ["source", "--download-only", id], { cwd: dir });
    const copyright = path.join(
      "/usr/share/doc",
      p.binary.split(":")[0],
      "copyright",
    );
    const dest = path.join(out, "native", p.pkg);
    await mkdir(dest, { recursive: true });
    await cp(copyright, path.join(dest, "copyright"));
  }
  await cp(
    "/usr/share/common-licenses",
    path.join(out, "native/common-licenses"),
    { recursive: true, dereference: true },
  );
  // Generated launch scripts are their own preferred source; preserve them and
  // the packaging recipe alongside source packages (no binary-only offer).
  const scripts = path.join(source, "packaging");
  await mkdir(scripts, { recursive: true });
  for (const file of (await scan(temp)).filter(
    (p) => path.basename(p) === "AppRun" || p.endsWith(".sh"),
  )) {
    const data = await readFile(file);
    if (data.subarray(0, 2).toString() !== "#!")
      throw new Error(`Unreviewed launcher binary: ${file}`);
    const dest = path.join(scripts, path.relative(temp, file));
    await mkdir(path.dirname(dest), { recursive: true });
    await cp(file, dest);
  }
  await cp(
    path.join(root, ".github/workflows/release-desktop.yml"),
    path.join(scripts, "release-desktop.yml"),
  );
  await cp(
    path.join(root, "scripts/stage_linux_sources.mjs"),
    path.join(scripts, "stage_linux_sources.mjs"),
  );
  const version = JSON.parse(
    await readFile(path.join(root, "package.json")),
  ).version;
  const catalog = {
    version,
    platform: "linux-x86_64",
    files,
    packages: [...packages.values()],
  };
  await writeFile(
    path.join(out, "native-system-catalog.json"),
    JSON.stringify(catalog, null, 2) + "\n",
  );
  await cp(path.join(out, "native"), path.join(source, "notices"), {
    recursive: true,
  });
  await writeFile(
    path.join(source, "source-manifest.json"),
    JSON.stringify(
      await createManifest(
        source,
        (await filesBelow(source)).filter((n) => n !== "source-manifest.json"),
        { version, platform: "linux-x86_64" },
      ),
      null,
      2,
    ) + "\n",
  );
  const name = `ascii-vj-remix-${version}-linux-x86_64-native-sources.tar.gz`,
    dest = path.join(root, ".compliance/artifacts", name);
  run("tar", ["-czf", dest, "-C", source, "."]);
  await writeFile(
    `${dest}.json`,
    JSON.stringify(
      {
        version,
        platform: "linux-x86_64",
        file: name,
        sha256: sha256(await readFile(dest)),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `Captured exact distro sources for ${packages.size} source packages.`,
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
