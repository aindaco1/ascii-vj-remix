import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createManifest,
  verifyManifest,
  verifySourceBundle,
  safeRelative,
} from "./lib/distribution_licenses.mjs";

test("required license bytes cannot disappear or change after staging", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ascii-legal-"));
  try {
    await writeFile(path.join(root, "app.txt"), "retained upstream license");
    const manifest = await createManifest(root, ["app.txt"], {
      version: "1.3.2",
      platform: "macos-aarch64",
    });
    await verifyManifest(root, manifest);
    await writeFile(path.join(root, "app.txt"), "replacement MIT license");
    await assert.rejects(verifyManifest(root, manifest), /hash/);
    await rm(path.join(root, "app.txt"));
    await assert.rejects(verifyManifest(root, manifest), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("manifest never escapes the inspected resource directory", () => {
  for (const name of [
    "../secret",
    "/tmp/secret",
    "C:\\secret",
    "foo/../../bar",
    "x\\y",
  ]) {
    assert.throws(() => safeRelative(name));
  }
  assert.equal(safeRelative("deps/name/LICENSE"), "deps/name/LICENSE");
});

test("source bundle must match both its digest and release identity", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ascii-sources-"));
  try {
    await mkdir(path.join(root, "sources"));
    await writeFile(
      path.join(root, "sources", "code.c"),
      "corresponding source",
    );
    const manifest = await createManifest(root, ["sources/code.c"], {
      version: "1.3.2",
      platform: "linux-x86_64",
    });
    await verifySourceBundle(root, manifest, {
      version: "1.3.2",
      platform: "linux-x86_64",
    });
    await assert.rejects(
      verifySourceBundle(root, manifest, {
        version: "1.3.3",
        platform: "linux-x86_64",
      }),
      /identity/,
    );
    await writeFile(path.join(root, "sources", "code.c"), "different source");
    await assert.rejects(
      verifySourceBundle(root, manifest, {
        version: "1.3.2",
        platform: "linux-x86_64",
      }),
      /hash/,
    );
    assert.ok((await readFile(path.join(root, "sources", "code.c"))).length);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
