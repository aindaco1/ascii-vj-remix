import { createHash } from "node:crypto";
import { readFile, readdir, lstat } from "node:fs/promises";
import path from "node:path";

export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export function safeRelative(name) {
  if (
    typeof name !== "string" ||
    !name ||
    /[\\:\x00]/.test(name) ||
    name.startsWith("/") ||
    name.split("/").some((p) => !p || p === "." || p === "..")
  )
    throw new Error("Unsafe resource path");
  return name;
}
export async function filesBelow(root, prefix = "") {
  const files = [];
  for (const entry of (
    await readdir(path.join(root, prefix), { withFileTypes: true })
  ).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink())
      throw new Error(`Unexpected source symlink: ${name}`);
    if (entry.isDirectory()) files.push(...(await filesBelow(root, name)));
    else if (entry.isFile()) files.push(name);
  }
  return files;
}
export async function createManifest(root, names, identity) {
  const files = [];
  for (const name of [...new Set(names)].sort()) {
    safeRelative(name);
    const bytes = await readFile(path.join(root, name));
    files.push({ path: name, bytes: bytes.length, sha256: sha256(bytes) });
  }
  if (!files.length) throw new Error("Empty compliance manifest");
  return { schema: 1, ...identity, files };
}
export async function verifyManifest(root, manifest) {
  if (manifest.schema !== 1 || !manifest.files?.length)
    throw new Error("Invalid compliance manifest");
  const seen = new Set();
  for (const file of manifest.files) {
    safeRelative(file.path);
    if (seen.has(file.path)) throw new Error("Duplicate manifest path");
    seen.add(file.path);
    const target = path.join(root, file.path);
    // Reject symlinks in every path segment, including directories.
    let current = root;
    for (const part of file.path.split("/")) {
      current = path.join(current, part);
      if ((await lstat(current)).isSymbolicLink())
        throw new Error("Symlink in compliance resources");
    }
    const bytes = await readFile(target);
    if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256)
      throw new Error(`Compliance hash mismatch: ${file.path}`);
  }
  return true;
}
export async function verifySourceBundle(root, manifest, identity) {
  if (
    manifest.version !== identity.version ||
    manifest.platform !== identity.platform
  )
    throw new Error("Source bundle release identity mismatch");
  return verifyManifest(root, manifest);
}
// Both apt-get and pull-lp-source verify source-file checksums. Also require
// the downloaded descriptor to identify the exact installed source package.
export function verifyDebianSourceIdentity(descriptor, pkg, version) {
  for (const [field, expected] of [["Source", pkg], ["Version", version]]) {
    const values = [...descriptor.matchAll(new RegExp(`^${field}: (.+)\\r?$`, "gm"))];
    if (values.length !== 1 || values[0][1].trim() !== expected)
      throw new Error(`Debian source identity mismatch: ${field}`);
  }
}
export const htmlEscape = (value) =>
  String(value).replace(
    /[&<>\"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
