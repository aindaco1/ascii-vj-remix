# 1.0.4 — Color Cycling and Renderer Performance

Stage: [published September 15, 2026](https://github.com/aindaco1/ascii-vj-remix/releases/tag/v1.0.4),
tagged at `95a82bef9453b7d0bb1ee180f376657d5f46d913`.
All three public install/updater lanes passed. Physical hardware acceptance
remains bounded by the checks recorded below.

## Scope

The [approved design](COLOR_CYCLING_1.0.4_PLAN.md) preserves the initial research
and plan. The implementation extends existing palette, renderer, control,
preset, transition and native-output seams. See the [Changelog](../../CHANGELOG.md)
for the complete release scope, including changes since 1.0.3 and shared-relay work.

- Four original 32-color families, eight pixel/glyph presets; 79/51/28 ownership.
- Stable base mapping and glyph luminance, independent animated display colors.
- Shared transport, zero/reverse speed, pause/resume and speed-transition integral.
- Startup/device/pipeline/lookup reuse with bounded resource ownership. Camera
  autostart still waits for camera identity discovery; images/video start independently.
  An actual-controller ordering test reproduced the initial optimization race
  before the fix and passes afterward.
- Readback-authorized recovery for static-image upload SecurityError (#35).
- Xcode 27 CI from reviewed PR #36; stable release lane retained.

## Evidence

| Gate | Evidence / state |
| --- | --- |
| Shared JS vectors | Passed: classic/blend, reverse/wrap, amount, stable glyph luminance, index 255, validation and speed integral. |
| Rust | 77 tests passed, including the final startup-diagnostics build. |
| Browser rendering | 79 presets passed in Chromium and the installed macOS 27 app (51 WebGPU / 28 Canvas); all eight new looks animate a still image in Chromium. Actual WebGL palette swatches passed for base palettes and frozen cycle times. Native-preview geometry/orientation checks passed. |
| Resource safety | JS coalesced compilation, retry after failure/device loss, bounded palette eviction, readable-image retry and tainted-image rejection passed. |
| macOS host/toolchain | macOS 27.0 (26A428), Xcode 27.0 (27A266a), Apple Silicon. Optimized dev app launches and presents native output. |
| Performance | Visible 480-column WebGPU run passed at 40.6 / 39.3 / 34.6 FPS (main / Pop Out / transition); native presentation 60 FPS, zero GPU failures. See the measurement record below. |
| Full local desktop/media gates | Passed `check:desktop`, `check:media`, final 77 Rust tests and Windows lifecycle/geometry tests. Final Chromium smoke passed including preset import/export and MIDI controls. |
| Exact release-candidate CI | Final `28d6609`: macOS 26, Xcode 27, Windows and Linux passed, including native GPU presentation and close/reopen on Windows/Linux. [Run](https://github.com/aindaco1/ascii-vj-remix/actions/runs/35003794477). |
| Exact merged/tagged CI | `95a82be`, tagged `v1.0.4`: macOS 26, Xcode 27, Windows and Linux passed. [Run](https://github.com/aindaco1/ascii-vj-remix/actions/runs/35007006774). |
| Public artifacts/updater | [Release workflow passed](https://github.com/aindaco1/ascii-vj-remix/actions/runs/35007023415): all platform packages, macOS signing/notarization, and macOS/Windows/Linux published install and 1.0.3 → 1.0.4 updater checks. Windows installers remain unsigned previews; updater packages are signed. |
| Windows/Linux physical camera/display | Not exercised on this Mac. Existing release ownership contract remains; new CI cannot substitute for device acceptance. |
| Final Mac dev handoff | Final optimized build and app-only bundle inspection passed; automatic WebGPU startup took 246 ms. Earlier pixel/glyph visual checks passed. Final foreground handoff awaits the locked Mac. |

## Windows/Linux Regression Boundary

Windows continues to use one Media Foundation camera owner, latest-frame
callbacks, and a binary JPEG main-preview bridge capped at 640×360/30 FPS.
Linux retains exclusive V4L2 capture, coordinated preview release/reacquisition,
and the bounded mirror fallback. No camera/session lifecycle implementation was
replaced. Native surface creation stays on the platform's required thread;
shader/device warming is off the Windows/Linux UI thread. Cached objects contain
no window, camera, surface, source texture, upload or frame buffer.

Validate cold/warm open, first visible frame, repeated close/reopen, camera →
video → camera, disconnect/reconnect, fullscreen/display changes and controls
while output is active using [Testing](../TESTING.md#hardware-and-platform-checks).

## Open Issues and PRs

- #35: add authorized-readback recovery and cleanup tests. The report omits the
  original image, so matching the reporter's precise input remains unconfirmed.
- #30: this host provides actual macOS 27/Xcode 27 build/runtime evidence. PR #36
  adds recurring compiler/SDK coverage; signed-artifact/updater and final UI
  acceptance remain separate below.
- #36: reviewed, all four CI lanes passed, merged as `6edc0d6`; included in this release.
- #37: release implementation merged after all candidate gates passed. No open
  PRs remained at the final release review. Issues #30 and #35 remain open for
  their outstanding physical acceptance and exact-input reproduction.

## Published artifact identity

See the [September 16 follow-up](#issue-review--2026-09-16) for deployment-target
findings discovered after publication. The original release evidence below is
preserved as recorded.

The [asset record](1.0.4-artifacts.json) captures the 14 published asset names,
sizes, GitHub SHA-256 digests, and download URLs. The updater manifest reports
1.0.4, and all nine platform aliases resolve to an uploaded signed updater
package. The release commit is identical to the final tested candidate tree.

The local download of `latest.json` and the macOS detached updater signature
matched the published SHA-256 digests. An additional local DMG/archive recheck
was stopped after sustained transfer rates near 10 KB/s; it is not counted as
local artifact acceptance. Public artifact trust, identity, and the previous
version update path passed in the release workflow on all three platforms.

## Local performance measurements

See [recorded runs](../performance/1.0.4-visible-macos27.json). The pre-optimization
reference already included color cycling; it is not the published 1.0.3 binary.
Visible before/after main, Pop Out and transition averages were 41.3/39.0/36.5
and 40.6/39.3/34.6 FPS. These are comparable steady-state results, not an FPS
speedup claim. Native output held 60 FPS without GPU failures.

The main gains remove repeated work: a repeated Tidal Glass lookup reuses the
32-cube table instead of rebuilding it (19.7 ms median rebuild in the local Node
component benchmark). Native opening reused the warmed adapter/device/pipelines:
first command 122 ms, repeat close/reopen 12 ms; surface/presenter setup rounded
to 0 ms and first presentation followed 4 ms / 1 ms after GPU readiness. These
intervals have different start points and are not a physical Windows measurement.

Two background/occluded performance runs failed and are retained in the record.
The harness now reports document visibility/focus and waits for actual measured
completion. An optional forced-WebGPU Chromium run had no GPU backend available;
the standard Chromium run passed. During that experiment one native launch
fell back to WebGL2 after 20.7 seconds and its initial image needed Reload;
this transient GPU-startup case is not counted as successful startup acceptance.
Subsequent clean launch checks are recorded separately below.

A clean Launch Services launch (`desktop:run-local`) automatically rendered the
Demo Image using WebGPU; renderer setup took 205 ms. Tidal Glass pixel and glyph
looks were reviewed in the native app on both Demo Image and Demo Video, with
the video advancing through a glyph-to-pixel transition while Pop Out was open.
Native video remained at 60 FPS without GPU failures. The stronger native smoke
passed: first GPU presentation 189 ms after open, repeat presentation 82 ms after
close/reopen, with 59.8 FPS during live parameter/cycling updates and no failures.
This smoke is now part of Windows and Linux PR CI, using verified bundled
FFmpeg sidecars. Linux uses a virtual display: first GPU presentation 2,150 ms, reopen 149 ms,
and live cycling/parameter updates passed at `66b063a` ([CI run](https://github.com/aindaco1/ascii-vj-remix/actions/runs/34998846438)).
Its legacy command label is `native-softbuffer`, but passing requires the GPU
presenter event on both opens. Windows also passed on the same app code at `3597017`: first presentation
1,563 ms, reopen 472 ms ([CI run](https://github.com/aindaco1/ascii-vj-remix/actions/runs/34996977641)).
Final candidate results for both platforms are recorded below.
A subsequent clean Mac launch selected WebGPU in 290 ms and native image opens
responded in 38 ms / 10 ms after close/reopen. The zero-speed still-image control
was visually checked with audio modulation disabled.


## Final startup review

The initial optimization could race default camera ID discovery against capture
startup. The actual-controller regression test failed before the correction and
passes with camera-only discovery ordering restored. Images and video still
start independently of device enumeration.

A covered-window check also reproduced dormant automatic startup when WebKit
withheld animation frames. Autostart now reuses `scheduleResponsiveFrame`, the
existing animation-frame/timer race, with a regression test for a missing frame.
The rebuilt `28d6609` app then started automatically through Launch Services
without pressing Start: WebGPU ready in 246 ms.

A local macOS 27 camera request stayed pending after native permission reported
`granted`. The preserved pre-optimization binary showed the same pending WebKit
`getUserMedia` request. This is unresolved physical-host evidence for #30, not a
passing camera check or proof of its underlying cause. No capture implementation
or permission policy was changed to work around it.

The final Linux candidate (`28d6609`) passed native presentation in 699 ms and
close/reopen in 191 ms on the CI virtual display, including live parameter and
cycling updates. The installed Mac app-only bundle inspection passed with
version 1.0.4, the development identifier, and bundled FFmpeg.

Final Windows candidate `28d6609` passed native presentation in 1,907 ms and
close/reopen in 321 ms, including live cycling/parameter updates. PR #37 was
merged as `95a82be` after all four candidate CI lanes passed.

## Issue review — 2026-09-16

Reviewed open issues [#30](https://github.com/aindaco1/ascii-vj-remix/issues/30),
[#35](https://github.com/aindaco1/ascii-vj-remix/issues/35), and
[#38](https://github.com/aindaco1/ascii-vj-remix/issues/38) against source
`3075b10` and the published 1.0.4 release. These follow-up changes are unreleased;
no public artifacts were replaced. Local host: Apple Silicon, macOS 27.0
(`26A428`), Xcode 27.0 (`27A266a`), SDK 27.0, Rust 1.96.0, Node 26.8.2.

### macOS packaging and compiler findings (#30)

The installed production 1.0.4 bundle advertises `LSMinimumSystemVersion=10.13`;
its app executable targets 11.0 and both bundled FFmpeg programs target 26.0.
That does not satisfy the documented macOS 13 support target. The FFmpeg binary
SHA-256 is `fdc8d107dbec8f20de2de4638aa173e89e653cfca98b64491f9171f6c7611e7d`;
ffprobe is `09a7ac5c6e16324c7f3790339ad7e45b85c039013f9b1baafe2b9d2bf0b819a9`.

The correction uses the Tauri config's explicit 13.0 floor for app/Cargo and
FFmpeg builds and validates the resulting Mach-O load commands. The new gate
rejects both installed 1.0.4 sidecars. Fresh Xcode 27 FFmpeg/ffprobe builds pass
with `minos=13.0`, and probe/decode the bundled 1080p H.264 fixture successfully.
The optimized development app also builds with plist minimum and executable
`minos` both 13.0; bundle identity, signature, resources and minimum-version
inspection pass. This is local development-artifact evidence, not a signed
production release or a macOS 13 runtime test.

The corrected development executable SHA-256 is
`502366497cd73bfb6e29a6fbe575b3800209fea229843474e08ad7b186bfe050`;
FFmpeg is `4b74c6baf071c3b992c77d4d761ff8f8411442e57fa09411d5d8e8d40dd30ce4`
and ffprobe is `7cd267c3585ca822cd67823e2f6d28c41242d564da3792c013edb51e230909a0`.
All 77 Rust tests pass in release mode. The installed development WebKit sweep
passes **79/79**, with **51 WebGPU / 28 Canvas**, on this candidate. Offline,
Tauri policy, release-build reuse, macOS identity/layout/deployment, FFmpeg
policy/source-build/runtime, and documentation link checks pass.

Native output produced a real GPU presentation on initial open and reopen in
both local runs (863/152 ms and 469/100 ms). Neither timed performance run is
accepted: the first overlapped Rust compilation and its 18.7 FPS source feed
missed the 20 FPS gate despite 59.8 FPS presentation; the second reported an
occluded surface. Preserve these as failed performance checks, not physical
display or sustained-performance acceptance.

The fresh release build also reproduced Rust `E0463` for `ctor_proc_macro`.
The library existed and its signature was valid; loading it directly exposed
`mis-aligned LINKEDIT string pool`. Leaving compile-time dependencies unstripped
via Cargo's release `build-override` fixes the reproduction and the full app
build. This matches the independently reported
[macOS 27 proc-macro loader failure](https://github.com/crynta/terax-ai/issues/1050);
[Cargo documents](https://doc.rust-lang.org/cargo/reference/profiles.html#build-dependencies)
the separation between build-dependency and application profiles.

The published release workflow remains successful on all three install/updater
lanes ([run 35007023415](https://github.com/aindaco1/ascii-vj-remix/actions/runs/35007023415)).
That earlier result does not prove older-OS sidecar compatibility. Keep #30 open
for macOS 13 runtime regression, signed Xcode 27 artifact/toolchain promotion,
production permission/upgrade preservation, physical camera/MIDI/audio/display
checks, and the remaining soak/performance matrix. The current preset contract
is **79 total / 51 accelerated / 28 explicit Canvas**, superseding the issue's
historical 71/43/28 baseline. Use the existing [Testing matrix](../TESTING.md#hardware-and-platform-checks).

### Image upload report (#35)

The two reports are from 1.0.3; authorized pixel-readback recovery already ships
in 1.0.4. Current readback, renderer fallback, and resource tests pass. A new
actual-WebGL regression forces the reported external-image `SecurityError`,
requires WebGL2 to remain active, compares every rendered pixel against the
normal upload, and checks one cached readback across two constructions. The
full Chromium 153 smoke passes with all 79 presets and no browser errors.
Tainted images still fail the browser's readback check. No production renderer
logic was changed in this follow-up. The reporter's precise input was not
included in the privacy-preserving report, so that exact-image reproduction
remains unverified.

### Upstream license notice (#38)

The maintainer selected retention of the existing license. The root README and
[contributor license section](../CONTRIBUTORS.md#license) now distinguish this
fork's inherited May 2026 text from upstream's September AGPL/MIT split, with
pinned upstream revisions and a matching license hash. `LICENSE` is unchanged;
no new upstream code was imported.
