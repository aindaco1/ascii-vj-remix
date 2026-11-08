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
  verifyDebianSourceIdentity,
} from "./lib/distribution_licenses.mjs";
import { sha256 } from "./lib/distribution_licenses.mjs";
import { verifyAppImageRuntime, extractVerifiedAppImage, isElf, separatelyCoveredElf } from "./lib/appimage_provenance.mjs";

test("historical distro source must match the installed package and exact version", () => {
  const descriptor = "-----BEGIN PGP SIGNED MESSAGE-----\nHash: SHA512\n\nSource: pcre2\nVersion: 10.42-4ubuntu2.1\n";
  verifyDebianSourceIdentity(descriptor, "pcre2", "10.42-4ubuntu2.1");
  assert.throws(() => verifyDebianSourceIdentity(descriptor, "pcre2", "10.42-4ubuntu2.2"), /identity/);
  assert.throws(() => verifyDebianSourceIdentity(descriptor, "other", "10.42-4ubuntu2.1"), /identity/);
  assert.throws(() => verifyDebianSourceIdentity(descriptor + "Version: 10.42-4ubuntu2.1\n", "pcre2", "10.42-4ubuntu2.1"), /identity/);
});

function runtimeFixture() {
  const runtime = Buffer.alloc(320), sources = Buffer.from("complete preferred source"), inputs = Buffer.from("reviewed inputs");
  Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1]).copy(runtime);
  runtime.writeUInt16LE(62, 18); runtime.writeBigUInt64LE(64n, 40);
  runtime.writeUInt16LE(64, 58); runtime.writeUInt16LE(3, 60); runtime.writeUInt16LE(1, 62);
  runtime.writeBigUInt64LE(256n, 128 + 24); runtime.writeBigUInt64LE(13n, 128 + 32);
  runtime.writeUInt32LE(1, 192); runtime.writeBigUInt64LE(288n, 192 + 24); runtime.writeBigUInt64LE(16n, 192 + 32);
  Buffer.from("\0.digest_md5\0").copy(runtime, 256);
  return { runtime, image: Buffer.concat([runtime, Buffer.from("payload")]), offset: runtime.length, sources, inputs,
    evidence: { schema: 1, runtimeSha256: sha256(runtime), sourceSha256: sha256(sources), inputsSha256: sha256(inputs),
      staticPackages: ["musl", "zstd", "zlib", "mimalloc", "gcc"].map(component => ({ component })) } };
}

test("AppImage publication rejects changed runtime, source, inputs or missing static sources", () => {
  const fixture = runtimeFixture(), { runtime } = fixture;
  verifyAppImageRuntime(fixture);
  const packed = Buffer.from(fixture.image); packed.fill(0xaa, 288, 304);
  verifyAppImageRuntime({ ...fixture, image: packed });
  for (const position of [287, 304, 16, 192]) {
    const changed = Buffer.from(packed); changed[position] ^= 1;
    assert.throws(() => verifyAppImageRuntime({ ...fixture, image: changed }), /runtime/);
  }
  assert.throws(() => verifyAppImageRuntime({ ...fixture, runtime: Buffer.from("substituted runtime") }), /runtime/);
  const malformed = Buffer.from(runtime); malformed.writeBigUInt64LE(1000000n, 40);
  assert.throws(() => verifyAppImageRuntime({ ...fixture, runtime: malformed, evidence: { ...fixture.evidence, runtimeSha256: sha256(malformed) } }), /ELF sections/);
  for (const offset of [0, -1, NaN, 1.2, fixture.image.length]) assert.throws(() => verifyAppImageRuntime({ ...fixture, offset }));
  assert.throws(() => verifyAppImageRuntime({ ...fixture, image: Buffer.from("corrupted image") }), /runtime/);
  assert.throws(() => verifyAppImageRuntime({ ...fixture, sources: Buffer.from("incomplete") }), /source archive/);
  assert.throws(() => verifyAppImageRuntime({ ...fixture, inputs: Buffer.from("new input") }), /inputs/);
  assert.throws(() => verifyAppImageRuntime({ ...fixture, evidence: { ...fixture.evidence, staticPackages: [] } }), /static runtime source/);
});

test("AppImage extraction rejects substituted executables before running them", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ascii-extraction-"));
  try {
    const fixture = runtimeFixture(), directory = path.join(root, ".compliance/appimage-runtime");
    await mkdir(directory, { recursive: true });
    await mkdir(path.join(root, "third_party/appimage-runtime"), { recursive: true });
    await writeFile(path.join(directory, "runtime-x86_64"), fixture.runtime);
    await writeFile(path.join(directory, "evidence.json"), JSON.stringify(fixture.evidence));
    await writeFile(path.join(root, ".compliance/runtime-sources.tar.gz"), fixture.sources);
    await writeFile(path.join(root, "third_party/appimage-runtime/inputs.json"), fixture.inputs);
    const archive = path.join(root, "substituted.AppImage");
    await writeFile(archive, "#!/bin/sh\ntouch executed\n", { mode: 0o755 });
    await assert.rejects(extractVerifiedAppImage(root, archive, root), /does not match its corresponding source build/);
    await assert.rejects(readFile(path.join(root, "executed")), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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
