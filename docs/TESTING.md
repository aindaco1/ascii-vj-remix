# Testing

This guide documents the current automated checks, manual verification paths,
and known coverage gaps for ASCII VJ Remix.

Testing focuses on offline bundles, renderer startup, source switching,
native output, media/camera/audio behavior, Tauri permissions, FFmpeg sidecars,
release artifacts, and updater manifests.

## Quick Reference

```bash
npm test                         # Desktop gate, static smoke, live synthetic Jev review
npm test -- --offline            # Same deterministic checks, explicitly skip Jev
npm run test:jev -- --dry-run     # Preview requests without credentials or network
npm run test:jev-harness          # Offline evaluator and workflow regression tests
npm run build                    # Vite production build plus local asset copy
npm run check:offline            # Build and verify bundled/offline assets
npm run smoke:static             # Static UI/renderer smoke harness
npm run test:smoke-diagnostics    # Failure capture, bounded waits, and artifact-write failures
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
npm run test:canvas-readback     # Contained success and blocked Canvas2D readback
npm run test:renderer-fallback   # GPU-to-Canvas fallback and bounded diagnostics
npm run test:preset-playlists    # Playlist schema, bounds, reorder, loop selection
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

## Jev Development Testing

`npm test` is the standard development entrypoint. It runs the Jev harness tests,
the existing `check:desktop` gate, `smoke:static`, then live Jev review. A failed
step stops the workflow; Jev never overrides a deterministic failure. The gate
builds a development binary but does not package, install, tag, or release it.
`npm test -- --offline` (also `npm run test:offline`) skips only live Jev.
It reports that semantic evaluation did not run. Existing focused commands and
release gates retain their behavior. Hosted Desktop CI checks the harness
offline and has no Jev credentials.

The evaluator uses the existing renderer fallback/report helpers, smoke-failure
diagnostics, and updater controller with fixed synthetic inputs. Six captured
outputs check recovery versus failure, initialization versus document loading,
missing diagnostic state versus the original failure, and update availability
versus successful installation or an unsuccessful check. Exact assertions run
first. Fourteen labeled positive/negative controls precede the six behavior cases.
These are component simulations; they do not exercise real camera hardware,
native presentation, image quality, or a real updater transaction. Browser smoke
still runs separately. No arbitrary report, screenshot, source file, user media,
camera/audio data, or private log is accepted by the Jev command.

### Setup and commands

```bash
git submodule update --init shared/dust-wave-platform
npm ci
npm run test:jev -- --dry-run
npm run test:jev
npm test
```

Set `CLOUDFLARE_ACCOUNT_ID` in the environment, or put only the account ID in the
ignored `.ascii-vj-development.json` as
`{"cloudflare_account_id":"YOUR_ACCOUNT_ID"}`. Set `CLOUDFLARE_API_TOKEN` in the
environment or use an existing Wrangler login. The adapter uses the repository's
pinned Wrangler dependency; `--wrangler-auth` explicitly selects that login.
No token is saved in configuration or reports. Missing authentication is an
error, never a silent offline pass.

The live command sends at most 20 requests / 20 atomic questions, capped at
64,000 total request bytes. Requests are sequential with a 45-second timeout,
stop on the first provider error, and never retry or purchase credits. Review
the exact preview before expanding the corpus; live usage is billed by the
configured provider account. Request limits are not a guarantee of a dollar
price. Jev uses [typed questions](https://docs.typesafe.ai/introduction) through
Cloudflare, with cache/log-skip request headers; those headers do not establish
the provider's retention policy.

### Results and shared ownership

Each run creates a new ignored `jev-results/<timestamp>/` directory, or a new
directory supplied with `--output-dir`. It retains requests, source hashes,
incremental/raw answers, final `report.json`, and `review.md`. Existing output
directories are rejected. Dry runs have zero network attempts, remain incomplete,
and explicitly say `dry-run`. Exit codes are 0 for pass/preview, 1 for fail/review,
and 2 for setup/provider error. `releaseAccepted` is always false.

Near ties (margin below 0.10), uncertain answers, unrecognized judge versions,
or incorrect known-answer controls require review and make development testing
nonzero. Only `jev-1.13.0` is initially recognized. The margin is provisional for
these engineering-labeled fixtures, not inherited CutNotes calibration or proof
of general reliability. Do not change prompts or thresholds merely to make a
run green. Treat observed controls as regressions; use fresh held-out examples
before claiming calibration after prompt changes.

The first local run caught a false pass on a negative diagnostic-capture control
and correctly returned review. Its broad "distinguishes failures" question was
replaced with the explicit requirement to retain renderer startup as failed;
two fresh phrasings were fixed before the revised run. With the threshold
unchanged, that run passed all 14 controls and six behavior cases on Jev 1.13.0.
Both runs remain in local evidence. This is a small local verification, not
independent calibration or physical-platform acceptance.
The [integration verification record](testing/JEV_EVALUATION.md) preserves the
exact results, evidence hashes and cleanup boundaries.

Request construction, Cloudflare transport, response validation, and review
routing reuse Platform Test Core 0.3.0 at immutable commit
`60d439b887f1244f82ff232c849d74152b28c776`, through the public `test-core/jev`
entry. This is the additive package reviewed in
[Platform PR 46](https://github.com/aindaco1/dust-wave-platform/pull/46).
The adapter rejects a different or dirty Platform checkout. ASCII VJ owns only
its corpus, authentication, budgets, reports, and command orchestration. There
is no sibling-project import or copied model client, new npm dependency, runtime
model call, or app version change. The shared checkout is not copied into `dist`.
Rollback removes the four test scripts, commands, submodule, CI harness step,
and documentation together; no application/data migration is involved.

## Test Categories

| Area | Current Checks |
| --- | --- |
| Offline runtime | `npm run check:offline`, `scripts/check_offline_bundle.mjs` |
| Static UI harness | `npm run smoke:static`, including activation, clean-profile default, live preset search, playlist edit/save/reorder/loop controls, accessible native-only screenshot UI, aligned select geometry, visible output, WebGL errors, glyph-page completion, and aspect checks for every built-in Demo Image preset |
| Tauri policy | `npm run check:tauri-policy` |
| App icons | `npm run check:icons` |
| Unicode glyph atlas | `npm run check:glyph-atlas`, complete-block assertions in renderer math/Rust tests |
| Output display logic | `npm run test:output-display` |
| Preset playlists | `npm run test:preset-playlists`, plus rendered control-token alignment, no-prompt creation, active-preset avoidance, modal dismissal, truthful transition status, shared transition routing, and start/stop coverage in `npm run smoke:static` |
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
| Installed primary presets | `npm run smoke:primary-presets`, all 79 built-ins on Demo Image with per-preset primary visibility, backend-family, running-state, GPU-error, and aspect checks |
| Release install/update | `npm run smoke:release-install` |

## Recommended Check Sets

### Documentation Only

```bash
git diff --check
```

For moved or split guides, also check relative file links, heading anchors,
and workflow/script references to the old paths. Include the new files in link
validation; `git diff --check` only detects whitespace errors. The
[documentation index](README.md#maintaining-documentation) defines ownership.

### Frontend UI, CSS, Presets, Sources, Audio UI

```bash
npm run build
npm run smoke:static
```

Add manual checks for source switching, preset transitions, WTF mode, and audio
reactivity when behavior changes.

The static smoke prints its browser version and executable name. On failure it
prints the original error, current phase, bounded console/page errors, failed
requests and HTTP errors, and explicit startup state for each test page. Request
URLs omit credentials, queries, and fragments. State capture and screenshots
have bounded waits so an unresponsive page cannot suppress the failure report.
The browser is closed on both success and failure.

Each failed invocation saves `failure.json` and best-effort page screenshots in
a timestamped folder under `tmp-smoke-static/`. Set `SMOKE_DIAGNOSTICS_DIR` to
choose another parent directory. These fresh browser contexts contain synthetic
smoke fixtures; diagnostics do not dump storage, environment variables, or the
full DOM. The Windows Desktop job uploads failure diagnostics as a separate
artifact retained for seven days. This does not relax startup timeouts, visible
renderer checks, or the 79/51/28 preset ownership contract.

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

The static smoke also forces `SecurityError` at WebGL2's external-image upload
boundary (#35), compares recovered pixels/orientation with the direct upload,
and verifies repeated construction reuses one authorized readback while staying
on WebGL2. `test:canvas-readback` separately verifies rejection of tainted images
and exclusion of video from this retry. The original reporter's private image
is not captured by these synthetic fixtures.

### Native Output or Pop Out Changes

`smoke:native-output` requires a real GPU presentation, applies live params and
palette cycling, closes through the normal window watcher, and requires another
presentation after reopening. Its report separates command response from first
presentation time. Windows and Linux PR CI run it against the optimized
development binary after packaging, with the verified bundled FFmpeg sidecars.
Linux uses Xvfb for a virtual display. This tests the native renderer and window lifecycle;
the physical camera/display matrix below remains separate. Set
`ASCILINE_NATIVE_OUTPUT_REPORT_PATH` to retain a JSON report. macOS additionally
checks display-link pacing with the existing log analyzer.

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
Set `ASCILINE_UI_PERF_SMOKE_STRUCTURAL=1` to alternate glyph and solid renderer
families and exercise the shared-clock native crossfade path.
Select an exact bundle and a longer sample with:

```bash
ASCILINE_SOURCE_APP="/absolute/path/ASCII VJ Remix.app" \
ASCILINE_UI_PERF_SMOKE_DURATION_MS=30000 \
npm run smoke:ui-perf
```

For primary preset changes, `npm run smoke:primary-presets` is the installed
Apple WebKit acceptance gate. The Chromium `smoke:static` matrix remains useful
but does not substitute for this desktop sweep. The signal sampler retains a
960x540 ceiling so sparse one-pixel Unicode masks are evaluated before a small
thumbnail can average them into the background.

Native log analysis reports both source upload and upload-skip rates. A healthy
24 FPS source on a 60 Hz display uploads near source rate and skips
the duplicate display ticks while presentation remains near refresh rate.
For glyph-mode changes, include traditional ASCII, Braille, CJK/Kana, Hangul,
and a mixed typed ramp in main/Pop Out checks. Confirm atlas pages load only for
the active ramp, unsupported scalars are reported, and Character Set/Font
Family changes do not hide the Glyph controls.

For Camera Pop Out, verify the resolved output mode as well as visible motion.
macOS, Windows, and Linux should select `native-camera` for one camera. Multiple
cameras should select `mirror`; Windows/Linux should also retry mirror when
native preflight cannot produce a frame. On physical Windows, confirm the
camera image advances in both the main and Pop Out windows with
`exclusiveCameraActive` true. In that single-owner session,
confirm `nativeOutputPreview.transport` is `binary-jpeg`, both views advance,
and the browser camera is reacquired after close without changing sources.
`test:output-display` executes the Windows source-handoff ordering and preview
geometry regression tests; `smoke:static` renders 4:3/16:9 native-preview fixtures
and checks their right edges. Use `SMOKE_REQUIRE_WEBGPU=1` on a WebGPU-capable
test runtime to reject fallback and exercise WebGPU texture replacement.
On Linux, confirm native Pop Out advances while the exclusive WebView preview
is paused and that the preview is reacquired after close. Capture a manual
report from the existing Reports dialog; a local policy simulation does not
replace device acceptance.

On Windows and Linux, also keep Pop Out open while switching repeatedly between
Demo Image, Demo Video, and Camera. Each mode change must finish the previous
native worker before the shared output window is reused. Close and immediately
reopen Pop Out after that sequence; the app must not panic on an invalid
`wgpu` surface or queue an `underlying handle is not available` report during
normal teardown.

For color-output changes, compare palette, brightness, contrast, background,
and neutral grayscale states between main and Pop Out. The Rust unit suite
requires the native surface selector to prefer non-sRGB unorm formats even when
the platform reports an sRGB format first.

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

The policy gate also checks that every command invoked by the desktop adapter
has a generated Tauri permission and a grant in the main-window capability. A
Rust command registered in `generate_handler!` is not callable from a packaged
webview until both ACL pieces exist.

Manually verify macOS Camera, Microphone, Screen/System Audio, and Pop Out
behavior when the permission model changes.

For crash-report changes, also verify that debug builds capture locally but do
not submit, release builds use only `https://crash.dustwave.xyz/v1/reports`, and
the output window has no crash-report permissions. The Reports control stays
visible with an empty queue, local media diagnostics are never submitted, and
renderer reports contain only the bounded structured event summary. Windows
WebView2 GPU output still requires physical Windows acceptance in addition to
these cross-platform contract checks.

Manual report acceptance should begin with an empty queue: enter a short note,
capture current state, confirm the preview contains a `manual-diagnostic`
report and bounded renderer/output context, then confirm a development build
keeps Send disabled. Separately verify production submission without attaching
media, screenshots, file paths, URLs, or arbitrary process logs.

The 2026-08-29 Windows 11 test established that Signal Court and Midnight Scan
CJK could initialize blank under both WebGPU and WebGL2, while Neon
Sledgehammer's solid/pixel path remained visible and Camera opened without a
spurious media-diagnostics report. The blanket Windows glyph-to-Canvas rule has
now been retired after the compact glyph-texture repair. Recheck representative
ASCII, Braille, CJK, Hangul, solid, and pixel presets on the replacement
installer before merging.

The static preset matrix also verifies backend ownership: clean state and
built-ins without an explicit compatibility backend retain Auto and resolve to
WebGPU/WebGL2 in the capable Chromium smoke runtime. The packaged preset sweep
separately requires the centralized 79 total / 51 accelerated / 28 explicit
Canvas ownership contract. The Windows CI lane runs the full visible matrix;
physical Windows acceptance must additionally confirm the 51 accelerated
presets resolve to WebGPU on the target RTX machine and remain visible.

The same smoke renders known color swatches through actual WebGL2 and compares
them with the shared palette mapper for all 21 palettes in nearest and luminance
modes, including startup and live palette changes. It also verifies that palette
uploads preserve the source-image orientation setting.

### FFmpeg and Media Engine

```bash
npm run test:ffmpeg-policy
npm run check:ffmpeg-resources
npm run check:media
npm run test:rust
```

`test:media-source-policy` covers both platform Demo Video selection and the
exact bundled source ids eligible for native FFmpeg fallback. The Rust suite
rejects traversal and unrecognized bundled ids. Physical Linux acceptance must
still prove that a webview decode failure reaches the fallback and displays
advancing frames.

For release sidecars:

```bash
npm run test:ffmpeg-source-build
npm run check:ffmpeg-release
```

### Release and Updater

The [Release and Updater Guide](RELEASING.md) owns packaging, signing,
publication, immutable-tag acceptance reruns, and CI smoke-hook configuration.
Use these checks to validate release changes:

```bash
npm run check:desktop
npm run test:desktop-updater
npm run test:updater-manifest
npm run check:bundle:debug
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

The controller test verifies that production availability permits exactly one
silent check per launch, current/offline results do not announce status, an
available update is not installed automatically, and the existing manual path
still performs rechecks and user-triggered installation.

For a manual updater check, launch the installed previous supported release,
confirm the background check surfaces the target version without downloading
it automatically, then exercise the explicit install action. Verify the target
version and app icon after relaunch, Reports visibility with an empty/pending
queue, and absence of the duplicate top-bar backend readout. Record the source
and target versions and artifact identities. Legacy missing-Update-control
recovery is documented in the [User Guide](USER_GUIDE.md#upgrading-from-096-or-097).

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
   Without an available input device, confirm the friendly inactive status and
   that Reports stays empty, including after relaunching over an older queue.
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
    visible, and that its colors match the main preview.
16. Confirm Stats Overlay reports the active preset/source/backend/grid/FPS.
17. Close Pop Out and confirm CPU/GPU usage settles.
18. With one camera selected on Windows, capture a manual diagnostic while Pop
    Out is open and confirm `cameraFallbackActive` is false. Confirm live output
    remains smooth while changing presets and FPS. With
    `exclusiveCameraActive`, confirm the main preview advances through
    `nativeOutputPreview`, its accepted FPS is nonzero, and the normal camera
    preview restores after close with `previewRestoreSucceeded` increasing. If mirror fallback activates, confirm
    `nativeOutputAdapter.nativeCameraFailureReason` explains why and the preview
    is reacquired.
19. Repeat the single-camera test on Ubuntu with AppImage/deb and Fedora with
    rpm. The main camera preview may pause while V4L2 is owned by native Pop
    Out; confirm it restores after close. If fallback activates, confirm the
    preview is reacquired and the report includes nonzero mirror accepted FPS.
20. With Pop Out open, repeat Camera → Demo Image → Demo Video → Camera, then
    close and reopen Pop Out. Check Acid Snowstorm's tiny-cell appearance and
    Arcade Rain's right edge against the main view; resize and change FPS and
    presets while both surfaces are visible. Keep one camera running for at
    least two minutes. Record cold and repeat first-visible-frame timings
    separately from command completion timings.

## Hardware and Platform Checks

The app depends on real hardware and OS media stacks. Automated tests do not
cover every hardware and platform combination.

The [1.0.3 release decision](releases/RELEASE_1.0.3.md#release-decision--2026-09-04)
records Windows owner acceptance and explicit deferral of Ubuntu/Fedora physical
camera testing. That Linux coverage gap remains open in the documented record;
run the single-camera checks in the [manual smoke checklist](#manual-smoke-checklist)
on exact installed artifacts before recording acceptance. CI and Hyper-V
package checks do not close physical camera coverage.

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

The [Release and Updater Guide](RELEASING.md#build-and-package) documents the
exact-commit Desktop prerequisite, parallel app/FFmpeg builds, immutable input
handoff, platform signing, publication, and post-publication acceptance.
[Security](SECURITY.md#release-security-posture) owns the security constraints.

Keep local, CI, published-artifact, installed-app, and physical-platform results
separate when reporting validation. Historical per-version evidence lives in
[release records](releases/README.md).

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
