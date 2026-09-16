# 1.0.5 — macOS Compatibility and Issue Follow-Ups

Current stage: **published and verified**, September 16, 2026. The maintainer
requested publication of PR #40. The preparation snapshot below preserves the
initial pending gates; completed publication and updater evidence follows it.

## Scope

- Use the documented macOS 13.0 floor for the app, Cargo helpers, and FFmpeg
  sidecars; reject newly packaged binaries requiring a newer OS. Published
  1.0.4 sidecars mistakenly required macOS 26.
- Leave compile-time Rust dependencies unstripped to avoid the Xcode 27/macOS 27
  proc-macro loader failure, without changing the shipped app's optimization.
- Add actual-WebGL regression coverage for the static-image SecurityError
  recovery already shipped in 1.0.4.
- Document the retained license and upstream revision/hash separately from
  ASCILINE's later AGPL/MIT split. LICENSE is unchanged.
- Include the previously merged #39 shared-Podman fix: selected engine and
  explicit endpoints are preserved, without restarting shared VMs.

The [September 16 issue review](RELEASE_1.0.4.md#issue-review--2026-09-16)
records the original reproduction, fixes, candidate artifact hashes and local
validation before the version bump. The [release guide](../RELEASING.md) owns
the maintained publishing and acceptance procedure.

## Preparation Validation Snapshot

These were the recorded gate states before publication.

| Gate | Evidence / state |
| --- | --- |
| Original PR candidate | 77 release-mode Rust tests; 79 Chromium presets and forced-upload recovery; optimized Xcode 27 build; all 79 installed WebKit presets (51 WebGPU / 28 Canvas); artifact minimum checks and H.264 sidecar decode passed. |
| Versioned 1.0.5 source / CI | Pending. |
| Signed public artifacts / updater | Pending. |
| Physical / older-OS acceptance | Remains open as described below. |

## Acceptance Boundaries

This corrective release does not claim macOS 13 runtime or full physical
macOS 27 camera, MIDI, audio, permission-migration, external-display, or soak
acceptance. The two original local native-performance runs recorded in the
issue review remain failed measurements (compiler contention and occlusion),
although both produced GPU presentation on open/reopen. Keep
[#30](https://github.com/aindaco1/ascii-vj-remix/issues/30) open for the remaining
matrix and Xcode 27 production toolchain promotion. Stable production packaging
continues to use the existing macOS 26 lane.

The exact private image behind
[#35](https://github.com/aindaco1/ascii-vj-remix/issues/35) is unavailable; its
synthetic recovery regression is not exact-input reproduction. Windows public
installers remain unsigned previews. Linux physical camera coverage retains
the existing documented deferral.

## Publication and Updater Acceptance — 2026-09-16

[PR #40](https://github.com/aindaco1/ascii-vj-remix/pull/40) was merged, and the
automated version workflow created `v1.0.5` at
`6c545bd26e37ddd82b7c77d302720e32a8b39386`. The
[public release](https://github.com/aindaco1/ascii-vj-remix/releases/tag/v1.0.5)
was published at 16:15 UTC with 14 immutable assets. The public latest release
and `latest.json` both identify 1.0.5; all nine updater platform aliases point
to signed packages in that release.

| Gate | Completed evidence |
| --- | --- |
| Versioned local source | Full `npm run check:release` passed, including 77 Rust tests; optimized 1.0.5 development bundle built on Xcode 27. |
| PR CI | [Desktop run 35115436763](https://github.com/aindaco1/ascii-vj-remix/actions/runs/35115436763): macOS 26, Xcode 27, Windows and Ubuntu passed, including Windows/Linux package and native Pop Out smokes. |
| Exact tagged source | [Main-push Desktop run 35118900916](https://github.com/aindaco1/ascii-vj-remix/actions/runs/35118900916): all four jobs passed at the tagged merge commit. |
| Public packages | [Release run 35118917770](https://github.com/aindaco1/ascii-vj-remix/actions/runs/35118917770): all platform builds, runtime checks, bundles and publication passed. macOS is Developer ID signed and notarized; Windows remains an unsigned preview. |
| Public updater acceptance | macOS, Windows and Linux each passed the 1.0.4 → 1.0.5 install/updater smoke against downloaded public assets. The first Linux job received GitHub HTTP 500 during asset download, before installation; rerunning only that job passed. No published bytes were rebuilt or replaced. |
| Downloaded macOS DMG on macOS 27 | SHA-256 matched GitHub's published digest. Trust, notarization/staple, Gatekeeper, DMG layout, production identity, version and app/sidecar minimum-version checks passed. |
| Existing local production installation | `/Applications/ASCII VJ Remix.app` found 1.0.5 without forcing the version comparison, downloaded and verified the 53,312,778-byte signed updater archive, completed replacement, and relaunched as 1.0.5 with Update/Reports controls present. The production designated requirement remained unchanged. |

The versioned native-output rerun opened/reopened in 281/128 ms and rendered
approximately 60 FPS in its visible samples. Its final sample was occluded,
so the overall performance gate remains failed. This does not supersede the
physical acceptance boundaries above.

### Published Artifact SHA-256

These hashes are from the release asset metadata. The downloaded DMG and feed
were also hashed locally; platform updater smokes validated signed packages.

| Asset | SHA-256 |
| --- | --- |
| `ASCII.VJ.Remix-1.0.5-1.x86_64.rpm` | `0d4663b1243127389599c92c42a34b4743e12dc77ee9c8eb57d90c309d924c5a` |
| `ASCII.VJ.Remix.app.tar.gz` | `8ef8dc2df21bf2759644abe82b750029510499192df8477593d6c10b998c0377` |
| `ASCII.VJ.Remix_1.0.5_aarch64.dmg` | `be058b790541b255ca71fa1242d3e3f552c6aed2d7c1f2fb368263932ea02b7c` |
| `ASCII.VJ.Remix_1.0.5_amd64.AppImage` | `9448b9c85e4fb61ca3a2ac9cc4982faade83d2d5625e6ac17e390e7e4a8ad395` |
| `ASCII.VJ.Remix_1.0.5_amd64.deb` | `5c7347acdc715a756d45f29395ce842c69dd698a32183814b59cd54e0634b41c` |
| `ASCII.VJ.Remix_1.0.5_x64-setup.exe` | `67d92b22f9137b0b3814aca34b01abc42e78e9d6dae4a58afcfbea161c4b30d5` |
| `ASCII.VJ.Remix_1.0.5_x64_en-US.msi` | `5b409b07b35edcf6873dc5b8ae17e1c65defac64126a15599cb7b6fc2f420e51` |
| `latest.json` | `88dd4af70ac37ffd5485a37d14aa85701c588e0febd09eee98f514983784babb` |
