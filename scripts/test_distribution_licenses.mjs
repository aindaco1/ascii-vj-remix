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
import { sha256 } from "./lib/distribution_licenses.mjs";
import { verifyAppImageRuntime, isElf, separatelyCoveredElf } from "./lib/appimage_provenance.mjs";

test("AppImage publication rejects changed runtime, source, inputs or missing static sources", () => {
  const runtime = Buffer.from("runtime"), sources = Buffer.from("complete preferred source"), inputs = Buffer.from("reviewed inputs");
  const fixture = { image: Buffer.concat([runtime, Buffer.from("payload")]), offset: runtime.length, sources, inputs,
    evidence: { schema: 1, runtimeSha256: sha256(runtime), sourceSha256: sha256(sources), inputsSha256: sha256(inputs),
      staticPackages: ["musl", "zstd", "zlib", "mimalloc", "gcc"].map(component => ({ component })) } };
  verifyAppImageRuntime(fixture);
  for (const offset of [0, -1, NaN, 1.2, fixture.image.length]) assert.throws(() => verifyAppImageRuntime({ ...fixture, offset }));
  assert.throws(() => verifyAppImageRuntime({ ...fixture, image: Buffer.from("corrupted image") }), /runtime/);
  assert.throws(() => verifyAppImageRuntime({ ...fixture, sources: Buffer.from("incomplete") }), /source archive/);
  assert.throws(() => verifyAppImageRuntime({ ...fixture, inputs: Buffer.from("new input") }), /inputs/);
  assert.throws(() => verifyAppImageRuntime({ ...fixture, evidence: { ...fixture.evidence, staticPackages: [] } }), /static runtime source/);
});

test("native inventory includes ELF helpers without a shared-library suffix", () => {
  assert.equal(isElf(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2])), true);
  assert.equal(isElf(Buffer.from("#!/bin/sh")), false);
  assert.equal(separatelyCoveredElf("usr/lib/webkit2gtk-4.1/WebKitNetworkProcess"), false);
  assert.equal(separatelyCoveredElf("usr/bin/ascii-vj-remix"), true);
  assert.equal(separatelyCoveredElf("usr/share/app/resources/ffmpeg/linux-x86_64/bin/ffmpeg"), true);
  assert.equal(separatelyCoveredElf("usr/lib/libndi.so.6"), true);
  assert.equal(separatelyCoveredElf("usr/lib/libndi-malicious.so"), false);
});

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
