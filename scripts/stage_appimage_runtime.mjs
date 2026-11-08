// Build the shipped runtime from reviewed source; never adopt a moving binary.
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, cp, rm, chmod } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { sha256, filesBelow, createManifest } from "./lib/distribution_licenses.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const recipe = path.join(root, "third_party/appimage-runtime");
const policy = JSON.parse(await readFile(path.join(recipe, "inputs.json")));
const inputs = path.join(root, ".compliance/runtime-inputs");
const output = path.join(root, ".compliance/appimage-runtime");
await mkdir(inputs, { recursive: true });
for (const source of [...policy.sources, ...policy.tools]) {
  const target = path.join(inputs, source.file);
  let bytes;
  try { bytes = await readFile(target); } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (!bytes || sha256(bytes) !== source.sha256) {
    const response = await fetch(source.url, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok) throw new Error(`Source download failed: ${source.file} (${response.status})`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (sha256(bytes) !== source.sha256) throw new Error(`Source checksum mismatch: ${source.file}`);
    await writeFile(target, bytes);
  }
}
for (const name of ["inputs.json", "Dockerfile"]) await cp(path.join(recipe, name), path.join(inputs, name));
await cp(path.join(root, "LICENSE"), path.join(inputs, "ASCII-VJ-Remix-LICENSE.txt"));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const connectionIndex = process.argv.indexOf("--podman-connection");
const connection = connectionIndex < 0 ? null : process.argv[connectionIndex + 1];
if (connectionIndex >= 0 && (!connection || connection.startsWith("--"))) throw new Error("Missing Podman connection");
const engine = connection ? "podman" : "docker";
const prefix = connection ? ["--connection", connection] : [];
const image = "ascii-vj-remix-runtime-builder";
const run = (args) => execFileSync(engine, [...prefix, ...args], { stdio: "inherit" });
run(["build", "--platform", "linux/amd64", "--build-arg", `RUNTIME_BASE=${policy.image}`, "-t", image, recipe]);
run(["run", "--rm", "--platform", "linux/amd64", "-e", `OUTPUT_UID=${process.getuid()}`, "-e", `OUTPUT_GID=${process.getgid()}`, "-v", `${inputs}:/inputs:ro`, "-v", `${output}:/output`, image]);

const sourceRoot = path.join(output, "sources");
const sourceManifest = await createManifest(sourceRoot, await filesBelow(sourceRoot), { runtimeCommit: policy.runtimeCommit });
await writeFile(path.join(sourceRoot, "source-manifest.json"), JSON.stringify(sourceManifest, null, 2) + "\n");
const archive = path.join(root, ".compliance/runtime-sources.tar.gz");
execFileSync("tar", ["-czf", archive, "-C", sourceRoot, "."], { stdio: "inherit" });
const evidence = {
  schema: 1,
  runtimeSha256: sha256(await readFile(path.join(output, "runtime-x86_64"))),
  sourceSha256: sha256(await readFile(archive)),
  appRunSha256: sha256(await readFile(path.join(output, "AppRun-x86_64"))),
  inputsSha256: sha256(await readFile(path.join(recipe, "inputs.json"))),
  runtimeCommit: policy.runtimeCommit,
  appRunCommit: policy.appRunCommit,
  staticPackages: JSON.parse(await readFile(path.join(sourceRoot, "static-packages.json"))),
  buildCommand: "node scripts/stage_appimage_runtime.mjs",
};
await writeFile(path.join(output, "evidence.json"), JSON.stringify(evidence, null, 2) + "\n");
if (process.platform === "linux") {
  // Tauri's locked Linux bundler reads these existing tools before downloading.
  const cache = path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "tauri");
  await mkdir(cache, { recursive: true });
  await cp(path.join(output, "AppRun-x86_64"), path.join(cache, "AppRun-x86_64"));
  await chmod(path.join(cache, "AppRun-x86_64"), 0o755);
  for (const tool of policy.tools) {
    await cp(path.join(inputs, tool.file), path.join(cache, tool.file));
    await chmod(path.join(cache, tool.file), 0o755);
  }
}
console.log(JSON.stringify(evidence, null, 2));
