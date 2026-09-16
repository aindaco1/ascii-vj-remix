# 1.0.5 — macOS Compatibility and Issue Follow-Ups

Stage: release preparation, September 16, 2026. The maintainer requested
publication of PR #40. Public artifact and updater acceptance are pending.

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

## Validation

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
