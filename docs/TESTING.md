# Testing

This guide documents the current automated checks, manual verification paths,
and known coverage gaps for ASCII VJ Remix.

Testing focuses on offline bundles, renderer startup, source switching,
native output, media/camera/audio behavior, Tauri permissions, FFmpeg sidecars,
release artifacts, and updater manifests.

## Quick Reference

```bash
npm run build                    # Vite production build plus local asset copy
npm run check:offline            # Build and verify bundled/offline assets
npm run smoke:static             # Static UI/renderer smoke harness
npm run check:tauri-policy       # Production CSP and local-only runtime policy
npm run check:icons              # Canonical source and generated platform icons
npm run check:glyph-atlas        # Unicode atlas manifest, dimensions, source, hashes
npm run test:output-display      # Secondary-display placement simulation
npm run test:desktop-updater     # Once-per-launch and manual updater orchestration
npm run test:updater-manifest    # Tauri latest.json/updater manifest tests
npm run test:macos-identity      # macOS bundle/team/designated-requirement tests
npm run test:macos-secret-args   # macOS notarization secret argument safety
npm run test:ffmpeg-policy       # FFmpeg policy checks
npm run check:ffmpeg-resources   # FFmpeg sidecar resource metadata checks
npm run test:frame-prep          # Rust/JS frame-prep parity
npm run test:decode-resize       # Decode/resize parity checks
npm run check:media              # Media pipeline checks
npm run test:render-math         # Shared renderer math vectors
npm run test:renderer-fallback   # GPU-to-Canvas fallback and bounded diagnostics
npm run test:audio-reactive      # Audio-reactive controls, clamps, dense-mix damping
npm run test:midi                # UC-33e map, scaling, pickup, actions, coalescing
npm run midi:probe -- --connect  # Physical mioXC input/output open test
npm run test:crash-report-ui     # Reports visibility, count, and action-state tests
npm run test:crash-relay         # Cloudflare crash relay sanitizer/rate-limit tests
npm run test:vectors             # Adaptive codec vector checks
npm run test:rust                # Rust tests
npm run check:desktop            # Main desktop validation gate
npm run check:release            # Release-oriented gate; expects staged FFmpeg sidecar
npm run bundle:debug             # Build and validate local debug bundle
npm run bundle:test              # Windows release-profile dev installer + GUI check
npm run bundle:test:linux        # Linux release-profile dev AppImage/deb/rpm
npm run bundle:release           # Release gate, release build, bundle check
npm run check:windows-authenticode # Inactive signed-Windows path signature check
npm run check:windows-gui        # Require the release EXE GUI subsystem
npm run smoke:native-output      # Native output performance helper
npm run smoke:ui-perf            # UI performance helper
npm run smoke:primary-presets    # Installed WebKit primary-view preset sweep
npm run bench:density            # Optimized density/feature comparison reports
npm run smoke:release-install    # Release artifact install/updater smoke
```

For documentation-only changes:

```bash
git diff --check
```

## Test Categories

| Area | Current Checks |
| --- | --- |
| Offline runtime | `npm run check:offline`, `scripts/check_offline_bundle.mjs` |
| Static UI harness | `npm run smoke:static`, including activation, clean-profile default, live preset search, independent alphabetical sections, overflow-menu focus, aligned select geometry, visible output, WebGL errors, glyph-page completion, and aspect checks for every built-in Demo Image preset |
| Tauri policy | `npm run check:tauri-policy` |
| App icons | `npm run check:icons` |
| Unicode glyph atlas | `npm run check:glyph-atlas`, complete-block assertions in renderer math/Rust tests |
| Output display logic | `npm run test:output-display` |
| Desktop updater behavior | `npm run test:desktop-updater` |
| Updater manifests | `npm run test:updater-manifest` |
| macOS app identity | `npm run test:macos-identity`, release artifact inspection on macOS |
| macOS secret handling | `npm run test:macos-secret-args` |
| FFmpeg policy/resources | `npm run test:ffmpeg-policy`, `npm run check:ffmpeg-resources`, `npm run check:ffmpeg-release` |
| Media frame prep/decode | `npm run test:frame-prep`, `npm run test:decode-resize`, `npm run check:media` |
| Renderer math/fallback | `npm run test:render-math`, `npm run test:renderer-fallback`, Rust shared-vector tests through `npm run test:rust` |
| MIDI | `npm run test:midi`, Rust MIDI/SysEx tests, `npm run midi:probe -- --connect` |
| Crash reports | `npm run test:crash-report-ui`, `npm run test:crash-relay` |
| Adaptive codec vectors | `npm run test:vectors` |
| Rust/Tauri modules | `npm run test:rust` |
| Native output performance | `npm run smoke:native-output`, `npm run test:native-output-log` |
| UI performance | `npm run smoke:ui-perf`, `npm run bench:density` with fixed defaults/transitions, feature configuration, phase percentiles, renderer replacements, and frame resets |
| Installed primary presets | `npm run smoke:primary-presets`, all 69 built-ins on Demo Image with per-preset primary visibility, backend-family, running-state, GPU-error, and aspect checks |
| Release install/update | `npm run smoke:release-install` |

## Recommended Check Sets

### Documentation Only

```bash
git diff --check
```

### Frontend UI, CSS, Presets, Sources, Audio UI

```bash
npm run build
npm run smoke:static
```

Add manual checks for source switching, preset transitions, WTF mode, and audio
reactivity when behavior changes.

### Renderer Backend Changes

```bash
npm run build
npm run test:render-math
npm run test:renderer-fallback
npm run check:glyph-atlas
npm run smoke:static
npm run check:media
```

Also manually compare WebGPU and WebGL2 output for representative feature-off,
palette/dither, Braille, CJK/Kana, Hangul, and typed custom-ramp states. Record
the actual backend; a requested backend that falls back is not evidence for the
requested backend.

### Native Output or Pop Out Changes

```bash
npm run test:output-display
npm run smoke:native-output
npm run test:native-output-log
npm run test:rust
```

Use an optimized app build before making performance conclusions.
The UI performance smoke starts from canonical visual defaults, uses fixed
non-structural numeric transitions, records each backend visited, and rejects a
primary canvas with no visible pixel signal even when its FPS counter advances.
Select an exact bundle and a longer sample with:

```bash
ASCILINE_SOURCE_APP="/absolute/path/ASCII VJ Remix.app" \
ASCILINE_UI_PERF_SMOKE_DURATION_MS=30000 \
npm run smoke:ui-perf
```

For primary preset changes, `npm run smoke:primary-presets` is the installed
Apple WebKit acceptance gate. The Chromium `smoke:static` matrix remains useful
but does not substitute for this desktop sweep.

Native log analysis reports both source upload and upload-skip rates. A healthy
24 FPS source on a 60 Hz display uploads near source rate and skips
the duplicate display ticks while presentation remains near refresh rate.
For glyph-mode changes, include traditional ASCII, Braille, CJK/Kana, Hangul,
and a mixed typed ramp in main/Pop Out checks. Confirm atlas pages load only for
the active ramp, unsupported scalars are reported, and Character Set/Font
Family changes do not hide the Glyph controls.

For the 0.9.11 normal-density contract, run matched feature-off and feature-on
optimized builds at 640 columns with synthetic audio and native output:

```bash
ASCILINE_UI_PERF_SMOKE_BACKEND=webgl2 \
ASCILINE_DENSITY_BENCH_COLUMNS=640 \
ASCILINE_DENSITY_BENCH_REPORT_PATH=/tmp/feature-off.json \
npm run bench:density

ASCILINE_UI_PERF_SMOKE_BACKEND=webgl2 \
ASCILINE_UI_PERF_SMOKE_PALETTE=signal-court \
ASCILINE_UI_PERF_SMOKE_DITHER=bayer4 \
ASCILINE_UI_PERF_SMOKE_CHARSET=cjk-basic \
ASCILINE_DENSITY_BENCH_COLUMNS=640 \
ASCILINE_DENSITY_BENCH_REPORT_PATH=/tmp/feature-on.json \
npm run bench:density
```

`bench:density` is a release gate: it exits nonzero when any child UI smoke
fails, when its report is not accepted, or when steady RSS grows by more than
the larger of 64 MB and 25 percent after warm-up. A macOS run whose windows are
backgrounded can be useful for memory-lifetime testing, but its throttled frame
rate must not be recorded as visible-window performance acceptance.

### MIDI, UC-33e, or SysEx Changes

```bash
npm run test:midi
npm run check:tauri-policy
npm run test:rust
npm run midi:probe -- --connect
npm run smoke:static
```

The physical probe verifies that CoreMIDI can enumerate and simultaneously open
both directions of the mioXC. It does not replace the control sweep and
full-bank capture/restore checklist in [MIDI_UC33E](MIDI_UC33E.md).

### Tauri Commands, Permissions, or Capabilities

```bash
npm run check:tauri-policy
npm run test:crash-relay
npm run test:rust
npm run check:desktop
```

Manually verify macOS Camera, Microphone, Screen/System Audio, and Pop Out
behavior when the permission model changes.

For crash-report changes, also verify that debug builds capture locally but do
not submit, release builds use only `https://crash.dustwave.xyz/v1/reports`, and
the output window has no crash-report permissions. The Reports control stays
visible with an empty queue, local media diagnostics are never submitted, and
renderer reports contain only the bounded structured event summary. Windows
WebView2 fallback still requires physical Windows acceptance in addition to
these cross-platform contract checks.

The 2026-08-29 Windows 11 test established that Signal Court and Midnight Scan
CJK could initialize blank under both WebGPU and WebGL2, while Neon
Sledgehammer's solid/pixel path remained visible and Camera opened without a
spurious media-diagnostics report. Recheck the Windows Tauri glyph-to-Canvas
compatibility policy on the replacement installer before merging.

### FFmpeg and Media Engine

```bash
npm run test:ffmpeg-policy
npm run check:ffmpeg-resources
npm run check:media
npm run test:rust
```

For release sidecars:

```bash
npm run test:ffmpeg-source-build
npm run check:ffmpeg-release
```

### Release and Updater

```bash
npm run test:desktop-updater
npm run check:release
npm run bundle:release
npm run smoke:release-install
npm run test:macos-dmg-layout
```

Run `npm run ffmpeg:build-sidecar` before `npm run check:release` on a clean
clone. `npm run bundle:release` runs the sidecar build step automatically.

The release smoke downloads artifacts from GitHub Releases and checks installer
layout, bundled assets, signed updater packages, `latest.json` behavior, the
visible packaged Update and Reports controls, and the absence of a duplicate
top-bar backend readout. On
macOS it verifies the downloaded DMG, mounts it read-only in a private temporary
root, validates the exact app-to-Applications layout, and inspects the mounted
app before the updater hop.

If artifact publication succeeds but a post-publication runner exposes an
acceptance-tooling defect, run the `Release Acceptance` workflow against the
existing immutable tag after correcting the tooling. It reuses the published
bytes and does not rebuild or replace release assets.
Updater-hop smoke uses `0.9.0` as the default minimum previous version because
older `0.1.x` releases were signed with a different updater key.

The controller test verifies that production availability permits exactly one
silent check per launch, current/offline results do not announce status, an
available update is not installed automatically, and the existing manual path
still performs rechecks and user-triggered installation.

Versions 0.9.6 and 0.9.7 shipped without the main-window app-name capability
used by the updater availability gate, so their Update control can flash and
then disappear. Install 0.9.8 manually from the notarized DMG. Relaunch 0.9.8
and confirm the current-version launch check stays silent while the Update
control remains visible, then use the control and confirm it reports `Up to
date`. For the 0.9.10 release, launch the installed 0.9.9 app and confirm its
background check surfaces 0.9.10 without downloading it automatically. After
the user-approved install, confirm the new app icon is present, Reports remains
visible in either its empty or pending-count state, and the right-side backend
readout is absent.

On macOS, release smoke extracts the current and previous `.app.tar.gz`
payloads, requires `com.asciline.remix`, Team ID `PWT3Q52LZ2`, hardened runtime,
Gatekeeper acceptance, and the exact same designated requirement, then runs the
previous app through the updater and revalidates the replaced bundle. The
interactive TCC approval itself remains a manual check.

## Manual Smoke Checklist

Use this after user-facing renderer, source, audio, or output changes:

1. Launch the desktop app.
2. Confirm Demo Image appears and renderer starts automatically.
3. Switch to Demo Video and confirm playback starts.
4. Switch back to Demo Image and confirm the renderer does not get stuck.
5. Select Camera and confirm permission prompt/device behavior.
6. Select Mic/Input and confirm Audio Reactivity starts or requests permission.
7. Switch audio devices and confirm capture restarts automatically.
8. Trigger Display/System Audio where supported and confirm errors are useful
   when the selected source has no audio track.
9. Click several presets and confirm smooth transitions.
10. Select a traditional ASCII preset and confirm Character Set and Font Family
    remain compact and visible.
11. Select palette/dither presets plus Braille, Hiragana, Katakana, CJK,
    Hangul, and a mixed custom ramp; confirm main and Pop Out remain in parity.
12. Toggle Advanced Density and confirm normal mode returns to the guarded
    ceiling; confirm the preference is not copied into a visual preset.
13. Toggle WTF mode on and off and confirm it remains responsive and can visit
    traditional ASCII-looking states.
14. Open Pop Out and confirm the main preview stays responsive.
15. Confirm Pop Out reflects presets, WTF mode, and audio reactivity while fully
    visible.
16. Confirm Stats Overlay reports the active preset/source/backend/grid/FPS.
17. Close Pop Out and confirm CPU/GPU usage settles.

## Hardware and Platform Checks

The app depends on real hardware and OS media stacks. Automated tests do not
cover every hardware and platform combination.

Important manual matrices:

- macOS Apple Silicon with built-in camera and external display.
- macOS with external USB camera.
- macOS with system audio capture.
- Windows with WebView2, D3D12/WebGL2, camera, mic, and installer path.
- Linux with WebKitGTK, GPU acceleration, camera, mic, and AppImage/deb/rpm
  paths. The maintained VM matrix and package checklist are in
  [Linux VM QA](LINUX_VM_QA.md).
- Experimental macOS Apple Silicon MIDI rig: Evolution/M-Audio UC-33e through
  both DIN directions of an iConnectivity mioXC, powered separately.

When reporting hardware results, include:

- OS version.
- CPU/GPU.
- app version and build type.
- source type.
- backend.
- Pop Out state.
- audio source.
- camera device names and requested resolution/FPS.

## Podman Checks

Podman is mainly for a reproducible Linux-like dev shell and legacy
Python/OpenCV/vector work. It is not the production runtime.

Useful commands:

```bash
scripts/podman-doctor.sh
scripts/podman_build.sh
scripts/podman_venv.sh
scripts/podman_codec_tests.sh
```

The Podman image defaults to Node 24. Use `NODE_MAJOR=26` only when explicitly
testing a newer Node baseline.

## CI and Release Behavior

Release CI:

- require a successful `Desktop` main-push run for the exact release commit.
- compile the app and build FFmpeg concurrently on macOS, Windows, and Linux,
  then verify and reuse those exact inputs for bundle-only packaging.
- verify offline bundle behavior.
- verify Tauri policy.
- build/check FFmpeg sidecars.
- run Rust and media tests.
- generate updater manifest fragments.
- merge fragments into `latest.json`.
- upload installers, updater packages, signatures, and `latest.json`.
- validate macOS Developer ID signing, notarization, stapling, and Gatekeeper
  acceptance before publishing macOS artifacts.
- publishes Windows artifacts as unsigned previews; the inactive signed
  Windows path includes Authenticode signer and timestamp validation.
- marks the Windows release executable as a GUI application and launches
  FFmpeg/ffprobe without visible child consoles.
- run install and visible-updater-UI smoke checks after publishing.
- run macOS updater identity/replacement smoke on `macos-26`.

## Known Gaps

- No comprehensive automated accessibility suite.
- No full i18n/l10n test suite.
- No golden visual output suite for presets.
- No automated camera latency benchmark.
- Experimental MIDI parsing, mapping, fake events, and SysEx assembly are
  automated; physical control sweeps and full-bank restore still require the
  UC-33e/mioXC rig.
- Linux native media/camera/audio coverage is limited outside CI.

Prospective release, platform, accessibility, localization, and performance
coverage is tracked in the [Roadmap](ROADMAP.md).
