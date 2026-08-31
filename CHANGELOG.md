# Changelog

## [Unreleased]

### Added

- Added live preset-name search with separate, independently alphabetized
  Built-in and My Presets sections, result status, keyboard clearing, and
  no-results states.
- Added release-profile pull-request packages for physical QA: an unsigned,
  updater-disabled Windows development installer plus AppImage, deb, and rpm
  Linux development packages retained for 14 days. Each package set includes
  the pinned, platform-built, verified FFmpeg/ffprobe resources.
- Added a non-destructive Hyper-V bootstrap and acceptance guide for Ubuntu
  26.04.1 and Fedora 44 x86_64 test VMs on Windows 11 Pro.
- Added a PE subsystem gate that rejects a Windows release-mode executable
  unless it is marked as a graphical application.

### Changed

- Bumped the source/package version to the 1.0.0 release candidate while
  leaving 0.10.0 as the latest verified public release until publication.
- Made Classic Camera ASCII the default visual state for a clean profile while
  preserving persisted profiles, and renamed the Point & Click Default display
  label to Dense Color ASCII without changing its stable preset id.
- Standardized sidebar select widths, heights, label columns, row spacing, and
  value presentation; removed the redundant one-option Atlas Style control.
- Labeled Advanced Density with its `Up to 900 columns` and no-30-FPS-guarantee
  constraint directly in the control row.
- Pinned Linux build and release acceptance runners to Ubuntu 24.04.

### Fixed

- Bound remote crash submission to both the production bundle identifier and a
  release build. Optimized `ASCII VJ Remix Dev` QA packages now keep reports
  local, label that state in the Reports UI, and cannot submit as production.
- Added real RFC 3339 capture timestamps plus safe script/line/column and
  requested/resolved renderer context to diagnostic issues without exposing
  local paths. Native WebKit stack frames are no longer mistaken for emails.
- Contained blocked Canvas2D pixel readback, including WebKit `SecurityError`
  code 18, inside the renderer instead of escalating it as a global app error.
- Added Linux-owned 1000x680 startup geometry with a 900x600 minimum instead of
  inheriting the larger macOS/Windows window, while deriving the development
  window title from its product identity rather than duplicating geometry.
- Added platform-owned built-in Demo Video formats: H.264/MP4 for macOS and
  Windows webviews, and VP8/WebM for clean Ubuntu and Fedora installations that
  lack optional H.264 GStreamer codecs. Existing saved Demo Video selections
  migrate to the correct platform asset, while user-selected videos retry
  through bundled FFmpeg if the platform decoder rejects them.
- Treat unavailable or disconnected microphone devices as an expected hardware
  condition. The app can attempt its browser fallback and no longer queues a
  crash report merely because a VM has no usable microphone.
- Made the Podman wrappers reuse an already-healthy default connection before
  starting their fallback VM, avoiding macOS's one-active-machine collision
  with other project checkouts.
- Decoupled the clean-profile Classic Camera ASCII look from the global
  renderer preference. Built-ins that do not explicitly request a compatibility
  backend now start from Auto and resolve to WebGPU/WebGL2 when available on
  every packaged desktop host.
- Restored real WebGPU glyph rendering in the packaged macOS Apple WebKit view.
  Glyph pages now decode through the bundled asset URL and compact the active
  maximum-96-scalar ramp plus its coverage mips into a two-row RGBA texture
  below WebKit's problematic wide-texture boundary. The installed preset sweep
  resolves 41 built-ins to WebGPU and 28 intentional compatibility presets to
  Canvas2D, with all 69 visible; Paper Shredder explicitly retains Canvas2D to
  preserve the look it predates glyph-atlas parity with.
- Increased the packaged preset sweep's primary-canvas sample resolution so
  sparse Braille, kana, Hangul, and box-drawing strokes are evaluated before
  thumbnail downsampling can average them away.
- Synchronized primary-view and native Pop Out transitions on one timestamped
  clock. Numeric transitions now use the same easing progress on both surfaces,
  renderer-family changes use the same crossfade curve, and native presentation
  uses minimum swapchain buffering instead of trailing by queued parameter
  round trips.
- Timestamped the primary video playback handoff so the native decoder advances
  its initial seek by the time spent opening the output window and starting the
  decoder, removing avoidable Pop Out playback lag.
- Prevented release-mode Windows app and FFmpeg/ffprobe child processes from
  opening visible console windows. Debug builds retain normal diagnostic
  console behavior.
- Retired the blanket Windows WebView2 glyph-to-Canvas policy now that the
  compact active-ramp glyph texture is shared by the repaired WebGPU path.
  Auto presets again attempt WebGPU on Windows, with WebGL2 and Canvas2D kept as
  real construction fallbacks. A centralized 69 total / 41 accelerated / 28
  explicit Canvas contract, a collapsed-seven unit regression, the visible
  preset sweep, and the Windows CI matrix guard this ownership boundary.
- Made the preset overflow menu focus its first action, close with Escape, and
  restore focus to its trigger.
- Made the local signing bootstrap import its temporary PKCS#12 identity with a
  Keychain-compatible password, and made the local launcher refuse to delete a
  bundle when its source and install paths are the same.

## [0.10.0] - 2026-08-29

### Added

- Added bounded renderer diagnostics to the existing Reports workflow. A failed
  renderer creation records the preset, requested and resolved backends,
  fallback result, source class, error summary, and up to eight recent renderer
  events without attaching media, screenshots, local paths, or arbitrary logs.
- Same-repository pull requests now retain an updater-disabled, unsigned
  Windows development installer for 14 days after the Windows desktop gate
  passes, allowing physical QA without replacing the production app.

### Changed

- Replaced the text-only `VJ` header badge with the canonical neon
  play-and-pixel app icon while preserving the existing top-bar footprint.

### Fixed

- Replaced the Unix-only `/tmp` media-diagnostics path with the operating
  system temporary directory so Windows diagnostic writes no longer fail and
  become spurious crash reports. Diagnostic-writer failures are also classified
  as non-fatal by both current clients and the relay.
- Applied the WebGPU/WebGL2-to-Canvas fallback to live preset transitions as
  well as initial startup. If both the requested renderer and Canvas fallback
  fail, the prior preset remains active and a reviewable diagnostic report is
  queued.
- Route glyph-atlas presets through the bounded Canvas2D renderer in the
  packaged Windows WebView2 runtime. Physical Windows 11 testing showed that
  WebGPU and WebGL2 could both report successful initialization while producing
  a blank glyph surface; solid/pixel GPU presets remain accelerated.

Version 0.10.0 makes Windows glyph presets reliable through a bounded Canvas2D
compatibility path, extends renderer failures into the existing privacy-bounded
Reports workflow, and replaces the main-header `VJ` badge with the canonical
app icon. Version 0.9.12 restores every built-in preset in the primary app view
while preserving the source aspect ratio and the native Pop Out path.

## [0.9.12] - 2026-08-28

### Fixed

- Restored visible primary-view output for every built-in Demo Image preset by
  correcting WebGL glyph-page uploads and using cached max-coverage atlas mips
  for glyphs rendered into very small cells.
- Kept solid, pixel, and glyph preset canvases at the source aspect ratio by
  resolving static row counts from the actual cell width and height.
- Added an all-preset primary-view smoke matrix covering activation, visible
  output, WebGL errors, lazy glyph-page completion, and canvas aspect.
- Prevented blank primary-view glyph canvases in the macOS Apple WebKit runtime
  by selecting the existing bounded Canvas2D glyph path there. Solid/pixel
  primary presets retain WebGPU, compatible runtimes retain GPU glyphs, and the
  native Pop Out renderer is unchanged.
- Made the packaged desktop performance smoke reject an advancing renderer
  whose primary canvas has no visible pixel signal.
- Added a packaged Apple WebKit sweep that activates all 69 built-in Demo Image
  presets and checks primary-view visibility, renderer family, running state,
  GPU errors, and source/canvas aspect for each final surface.

Version 0.9.11 adds performance-budgeted project palettes, ordered dithering,
multilingual glyph controls, custom Unicode ramps, density guardrails, and
renderer/native-output parity. Version 0.9.10 replaces the legacy television artwork with one canonical app
icon generated for every packaged platform and carries the post-0.9.9 Reports
acceptance correction. Version 0.9.9 keeps crash-report preferences reachable
with an empty queue,
removes the duplicate top-bar backend readout, and extends packaged UI smoke to
cover both controls. Version 0.9.8 restores the production Update control and
launch check, adds a packaged UI regression smoke, and shortens release builds
by compiling the app and FFmpeg runtime concurrently before verified artifact
reuse. Version 0.9.7 adds the silent launch-check controller while retaining
user-approved installation and strengthens release transport resilience.
Version 0.9.6 continues the experimental MIDI commissioning work, removes
measured renderer/output hot-path overhead without changing visual math or
quality, and hardens the macOS drag-to-Applications release path. Version 0.9.5
adds 23 credited ascii.today-inspired character presets and
experimental native DIN MIDI control for an Evolution/M-Audio UC-33e through an
iConnectivity mioXC, including four complete controller pages, soft takeover,
numeric preset selection, MIDI Learn, and full-bank SysEx capture/restore.
Version 0.9.3 moves public desktop releases to signed/notarized macOS
distribution, publishes Windows as an unsigned preview while signing is
deferred, and expands audio reactivity with dense-mix controls that reduce
overreaction on busy music. Version 0.9.0 remains the first documentation
baseline for the current ASCII VJ Remix feature set.

## [0.9.11] - 2026-08-28

### Added

- Added 16 project-native built-in palettes shared by controls, presets,
  Canvas, WebGL2, WebGPU, and native `wgpu` output: Signal Court, Ember Gold,
  Prism Armor, Verdigris Clay, Forest Kiln, Blush Lichen, Solar Standard,
  Primary Rite, Jewel Circuit, Spectrum Vault, Soft Voltage, Midnight Scan,
  Moss Ultraviolet, Cyan Fog, Dark Parade, and Sea Glass Array.
- Added nearest-color and luminance-ramp mapping plus ordered Bayer 2x2, 4x4,
  and 8x8 dithering with strength, scale, bias, and invert controls.
- Added glyph depth, offset, reverse, source/fixed glyph color, background
  color, and typed custom-ramp controls. Custom ramps are bounded to 96
  supported Unicode scalars.
- Added a deterministic, locally bundled neutral glyph atlas with ASCII,
  Braille, blocks, box drawing, shapes, arrows, mathematical and technical
  symbols, Latin Extended, Greek, Cyrillic, CJK punctuation/radicals,
  Hiragana, Katakana, CJK Unified Ideographs U+4E00-U+9FFF, and Hangul
  syllables.
- Added ten palette/glyph presets and incorporated the remaining palettes into
  existing presets without adding palette-pack or palette-JSON import.
- Added a global Advanced Density preference that exposes up to 900 columns
  outside visual presets and clearly removes the 30 FPS guarantee.

### Changed

- Fused palette lookup and ordered dithering into the existing cell pass. A
  shared 32x32x32 lookup table is rebuilt only when palette/mapping changes.
- Replaced the fixed bundled-glyph index path with Unicode-scalar glyph ids and
  a paged atlas shared by browser GPU and native Pop Out renderers.
- Repaged the atlas into sixteen 1024x1024 R8 pages. Total GPU allocation stays
  bounded while multilingual selection performs smaller lazy decode/upload
  operations; the decoded browser page cache is capped at four pages.
- Added a glyph-resource input key so 60 Hz audio and transition updates do not
  reconstruct ramps, allocate buffers, or upload glyph resources when glyph
  settings are unchanged.
- Native Pop Out now checks for an available surface before source-frame queue
  writes, drains macOS display-link autorelease work per tick, and polls
  completed GPU work. Occluded outputs no longer retain one upload staging
  allocation per decoded frame.
- Retuned built-in presets that previously requested 700 to 900 columns into
  the measured normal-density envelope. Advanced Density remains available as
  an explicit machine preference.
- Extended WTF, audio reactivity, and MIDI through the existing canonical
  parameter paths for palette, dither, and glyph behavior.

### Performance

- The normal accelerated ceiling is 640 columns and 160,000 total cells; the
  software ceiling is 120 columns and 6,000 cells. Advanced Density allows up
  to 900 columns and 500,000 cells without a frame-rate promise.
- On an optimized M1 Max/64 GB validation host at 640 columns with 1080p video,
  synthetic audio reactivity, and native Pop Out, feature-off WebGL2 measured
  39.1 FPS main, 39.9 FPS with Pop Out, and 35.4 FPS during transitions.
- The full Signal Court/Bayer 4/CJK workload measured 37.9, 40.1, and 37.0 FPS
  for the same phases, with a worst phase P95 of 31.6 ms and about 446 MB peak
  RSS. Native Pop Out presented near 60 FPS with zero GPU failures.
- A pre-fix unattended 15-minute occlusion run grew from 156.5 MB to 9,411.9 MB
  steady RSS. The fixed repeat began at 156.1 MB and ended at 155.5 MB, with a
  446.1 MB startup peak and no native-sync failures. Background-window
  throttling made that repeat memory evidence rather than FPS evidence.
- These figures are local evidence from a faster-than-floor host, not physical
  M1/16 GB or Windows integrated-GPU acceptance.

### Validation

- Added deterministic glyph source/manifest/hash verification and complete
  common-block coverage tests for 34,895 Unicode scalars across 16 pages.
- Extended static smoke to prove palette/dither/custom multilingual ramp state
  reaches the WebGL2 output renderer and loads only the required atlas pages.
- Extended UI performance reports with requested feature configuration,
  renderer replacement counts, frame resets, and actual backend selection.
- Density benchmarks now fail their process when a child run fails its FPS
  contract or exceeds the steady-memory drift budget; a failed report can no
  longer be printed from a successful benchmark command.
- Renderer math, atlas verification, optimized static smoke, native Pop Out
  smoke, and all 48 Rust tests pass locally. WebGPU was not exposed by the
  local macOS webview during the optimized acceptance run, so it fell back to
  WebGL2 and is not claimed as a local WebGPU performance result.

## [0.9.10] - 2026-08-26

### Changed

- Replaced the legacy television app icon with the new neon play-and-pixel mark
  across the macOS, Windows, Linux, iOS, and Android assets generated by Tauri.
- Added one canonical 1024px RGBA icon source and a single generation command;
  platform-specific icon files are generated outputs rather than independent
  artwork sources.

### Fixed

- Published-release UI acceptance now recognizes both valid Reports states:
  the empty `Reports` label and the pending-count label. A valid pending report
  no longer causes Windows or Linux acceptance to reject otherwise working
  immutable release artifacts.

### Validation

- Added a cross-platform icon check that regenerates all Tauri icon assets from
  the canonical source and compares their decoded, alpha-composited image
  content. PNG payloads inside ICO and ICNS containers are normalized so
  platform-specific compression, transparent RGB data, container ordering, and
  generated XML line endings do not mask artwork changes. A tightly bounded
  pixel tolerance covers minor cross-platform resampling differences while
  rejecting visible drift.
- Desktop and release gates now run the icon consistency check before compiling
  or packaging the app.

## [0.9.9] - 2026-08-26

### Fixed

- The top-bar Reports control now remains visible in Tauri builds when the
  crash queue is empty, so users can review the existing `ask`, `always`, and
  `off` preference without waiting for an error. Pending reports still add a
  count and warning state; Send and Discard remain disabled with an empty queue.
- Removed the duplicate right-side backend readout from the top bar. The center
  Backend selector remains the canonical control, while the user-owned Stats
  Overlay continues to report the resolved runtime backend.
- Packaged updater UI smoke listeners now bind before device initialization, so
  early smoke requests cannot race camera or audio startup.

### Security

- Reports continue to contain only bounded, sanitized crash data. Local media
  diagnostics and arbitrary logs are not attached or submitted.
- Added an opt-in production crash-relay acceptance canary that refuses to run
  when any user report is already pending and submits only a hard-coded
  synthetic payload.

### Validation

- Added deterministic crash-report UI state tests for browser, empty, pending,
  disabled, and busy states.
- Static and packaged release smoke now require the duplicate backend status to
  be absent. Packaged macOS, Windows, and Linux smoke also requires the Reports
  control to remain visible with an empty queue.

## [0.9.8] - 2026-08-26

### Fixed

- Restored the production Update control and automatic launch check by granting
  the main window the narrow `core:app:allow-name` permission used to verify the
  production app identity. The missing permission caused the control and status
  area to flash and then disappear in 0.9.6 and 0.9.7.
- Updater availability failures now log their cause instead of failing silently.

### Changed

- Release CI now resolves one immutable tag commit, requires the exact
  `Desktop` main-push workflow to succeed for that commit, and builds the
  FFmpeg runtime and Tauri app binary in parallel.
- Bundling restores the exact one-day workflow artifacts. FFmpeg keeps its
  pinned source/hash/resource checks, while the app binary handoff verifies
  commit, platform, version, byte size, and SHA-256 before Tauri packages it
  without recompiling.

### Validation

- Added release-build reuse tests covering exact workflow-run selection and
  rejection of altered or mismatched app binaries.
- Published-release smoke now launches the packaged app on macOS, Windows, and
  Linux and requires the Update control to remain visible, covering the actual
  UI path rather than only invoking the native updater directly.

## [0.9.7] - 2026-08-26

### Added

- The production desktop app now performs one non-blocking release-metadata
  check for signed updater packages whenever it opens. Current-version and
  offline launch checks stay silent; a newer version is surfaced through the
  existing top-bar Update control. A production capability regression prevented
  that control from remaining available until the 0.9.8 fix.
- The manual Update control remains available for an immediate recheck, and
  downloading, installation, and relaunch remain explicitly user initiated.

### Fixed

- Release source downloads now retry bounded transient transport failures and
  promote only completed FFmpeg tarballs before the pinned SHA-256 check.
- Automatic desktop-release dispatch now retries transient GitHub API failures
  with bounded backoff.

### Security

- Automatic checks reuse the existing Tauri updater endpoint and signed
  artifacts. They send no media, camera, audio, preset, MIDI, crash-report, or
  local-path data, and development builds continue to disable production
  updater endpoints.

### Validation

- Added deterministic updater-controller coverage for one check per launch,
  silent current/offline results, update discovery without automatic install,
  the manual fallback, download progress, and relaunch handoff.

## [0.9.6] - 2026-08-17

### Changed

- Native macOS Pop Out now converts and uploads a decoded RGB source frame only
  when its source-frame version changes. The display link can continue presenting
  and applying live visual/audio parameters at display refresh without uploading
  the same video frame again.
- WebGPU reuses uniform backing storage, texture views, and stable bind groups;
  per-frame browser-video external-texture binding remains dynamic as required.
- WebGL2 resolves shader uniform locations at initialization instead of looking
  up all 18 locations on every rendered frame.
- Numeric preset/WTF transitions update only controls whose values are changing.
  Source lists, camera choices, visibility, meters, and the rest of the control
  surface are synchronized once at completion rather than on every animation
  frame.
- Optimized UI performance smoke uses clean defaults and fixed non-structural
  transition targets, records P10/P50 as well as average FPS, reports the
  backends actually visited, and accepts an exact app bundle through
  `ASCILINE_SOURCE_APP` for release comparisons.
- Advanced the desktop/package version to 0.9.6. MIDI remains experimental while
  physical UC-33e/mioXC commissioning is completed.
- Normal Tauri development and debug-bundle commands now use `ASCII VJ Remix
  Dev` with bundle identifier `com.asciline.remix.dev`. The production name and
  `com.asciline.remix` identifier remain exclusive to release packaging.
- The macOS DMG keeps Tauri as its single packager, makes the standard
  app-to-Applications layout explicit, and documents the DMG as the primary
  manual installer. The `.app.tar.gz` remains an updater artifact.

### Fixed

- Corrected the UC-33e commissioning guide to use extended button mode 146 for
  distinct press/release values. A plain standard-CC assignment toggles between
  two values and does not provide the momentary edges expected by the app.
- Clarified that Control Select is the single physical `SELECT` button and added
  exact front-panel programming, store, SysEx capture/restore, and verification
  steps.

### Performance

- On the optimized macOS Apple Silicon test build, a 24 FPS video presented at
  60 FPS in native Pop Out with about 23.8 source uploads and 36.3 upload skips
  per second: roughly 60% of the former duplicate conversion/upload work was
  removed while presentation stayed at 60.1 FPS.
- Steady optimized-build phases remained quality-equivalent and non-regressed:
  the published 0.9.5 reference measured 35.8 FPS main / 39.3 FPS with Pop Out,
  while the final 0.9.6 candidate measured 38.6 / 39.0 FPS and sustained 35.9
  FPS during its fixed numeric-transition phase.
- The static smoke harness now asserts that a numeric transition performs no
  more than two source-control synchronizations and one camera/full-visual
  synchronization, instead of repeating full UI work throughout the tween.
- Renderer shader code, sampling, color processing, glyph math, output
  resolution, source FPS, and quality controls are unchanged.

### Security

- Removed local-runner synchronization into `/Applications/ASCII VJ Remix.app`.
  The runner now accepts only the development bundle identifier and refuses
  ad-hoc signing by default, preventing local rebuilds from replacing the
  production app or contaminating its macOS privacy grants.
- Development builds disable updater artifacts and production updater endpoints.
- macOS release validation now requires the exact production bundle identifier,
  Developer ID Team ID `PWT3Q52LZ2`, hardened runtime, and a stable team-based
  designated requirement. Code-hash-only/ad-hoc identities fail closed.
- Release validation extracts the actual `.app.tar.gz` updater payload and
  verifies that its identity and designated requirement match the notarized
  application bundle.
- Release validation verifies DMG integrity, mounts the image read-only under a
  private temporary root, accepts only the app, exact `/Applications` link, and
  reviewed Tauri metadata (the required volume icon plus an optional regular
  `.DS_Store`), and applies the existing app structure and production identity
  checks to the mounted copy.
- Published-release smoke now requires and revalidates the downloaded DMG before
  exercising the updater hop. Publishing refuses to replace existing artifact
  bytes for the same release tag.

### Validation

- Added a Rust unit test for versioned native source-upload decisions.
- Added browser smoke coverage for bounded numeric-transition UI work.
- Extended native output log analysis with source upload and upload-skip rates.
- Added cross-platform unit coverage for macOS code-signing identity parsing and
  rejection of ad-hoc, wrong-identifier, wrong-team, and changed-requirement
  artifacts.
- Added cross-platform DMG layout, mount-point, artifact-discovery, and mounted
  app-structure contract tests.
- Added a macOS 26 published-release smoke job that compares consecutive
  Developer ID requirements, performs an application-driven updater replacement,
  and revalidates the updated bundle's identity.
- Validated the optimized `.app` build plus static rendering, renderer math,
  audio reactivity, all 188 default MIDI bindings, Tauri policy, and 47 Rust
  tests on macOS Apple Silicon.
- Built and mounted an optimized local 0.9.6 app/DMG canary and passed the shared
  bundle/resource/layout check. This local artifact is ad-hoc signed; the final
  Developer ID signed and notarized canary remains required before publication.

## [0.9.5] - 2026-08-04

### Added

- Added 23 read-only ascii.today-inspired character presets, including Broadway
  KB, Computer, Doom, Ghost, Modular, Standard, Univers, and Doh.
- Added a shared bounded character-set catalog with source/author metadata and
  matching Character Set menu entries for every new preset.
- Added credited source and adaptation notes in
  `docs/ASCII_TODAY_PRESETS.md`.
- Added experimental native cross-platform MIDI input/output through Rust
  `midir`, with CoreMIDI as the primary macOS Apple Silicon backend and
  compatible Windows and Linux backends retained for CI and future hardware
  validation.
- Added the Evolution/M-Audio UC-33e through iConnectivity mioXC as the first
  experimental hardware profile. Direct UC-33e USB input remains out of scope.
- Added four complete 47-control pages: Visual, Audio, Presets, and Fine/User.
- Added soft takeover, input coalescing, curves, inversion/range support, MIDI
  Learn overrides, port monitoring, and automatic mioXC reconnection.
- Added stable MIDI preset slots from 1 through 128 with numeric entry, Enter,
  Previous, Next, and Clear actions.
- Added a desktop MIDI panel with input/output status, active page, last-message
  monitor, mapping reset, profile capture, Install/Restore, and Verify actions.
- Added bounded full-bank SysEx capture and paced restore through the mioXC
  return DIN connection, plus optional Ensure Profile on Connection.
- Added a physical mioXC discovery/connection probe and a complete printable
  controller map in `docs/MIDI_UC33E.md`.

### Changed

- Native glyph Pop Out now consumes the resolved shared character ramp and
  accepts it only when it is space-leading, unique, bounded, and fully covered
  by the fixed bundled glyph atlas.
- MIDI hardware commissioning is explicitly paused after confirming the
  controller ids for keypad C34–C43 and transport C44–C47. The software remains
  implemented; the remaining physical restore and acceptance work is recorded
  in the Roadmap.
- MIDI is labeled experimental in the UI and documentation because the full
  physical control sweep and end-to-end SysEx restore/verification checklist
  remain incomplete. Ensure Profile on Connection stays disabled by default.
- UI controls and MIDI now route through the same canonical parameter ranges,
  clamping, structural-change handling, audio settings, and preset transition
  behavior.
- Visual preset changes re-arm soft takeover so non-motorized UC-33e controls
  cannot jump across the active software value.
- MIDI is intentionally restricted to visual params, audio-reactive settings,
  visual presets, and WTF mode. It cannot change sources, Camera, Pop Out, or
  output displays.

### Security

- MIDI and SysEx commands are granted only to the main control window. The
  presentation-only output window receives no MIDI permissions.
- The initial native adapter accepts only ports whose names contain `mioXC`.
- MIDI queues, SysEx packet counts, decoded bytes, stored mappings, and preset
  slots are bounded and validated.
- Captured controller profiles remain local and contain no media paths, frames,
  audio, credentials, or network data.

### Validation

- Extended renderer-math checks to cover all 23 new catalog entries, including
  ids, bounds, uniqueness, printable glyphs, attribution metadata, and Broadway
  KB luminance lookup.
- Extended static smoke coverage to require ascii.today names in both the
  Character Set control and built-in Presets panel.
- Added Rust coverage for native character-ramp acceptance and rejection.
- Added `npm run test:midi` for the 188 default hardware bindings, value
  scaling, soft takeover, action edges, event coalescing, and scope exclusions.
- Added Rust tests for MIDI parsing, fragmented SysEx assembly, transfer
  validation, and mioXC-only port scoping.
- Added `npm run midi:probe` and `npm run midi:probe -- --connect` for physical
  CoreMIDI port and simultaneous input/output validation.
- Extended static smoke coverage to validate canonical visual/audio MIDI target
  routing and ensure browser mode keeps the desktop-only MIDI panel hidden.
- Extended Tauri policy checks to require MIDI permissions on the main window
  and forbid them on the output window.

## [0.9.3] - 2026-06-26

### Added

- Added future Windows signing tooling through Azure Artifact Signing and
  Tauri's Windows `signCommand`; the active 0.9.3 Windows release path remains
  an unsigned preview.
- Added Windows Authenticode verification tooling for future signed release
  artifacts, including signer and timestamp checks.
- Added `src-tauri/tauri.windows-signed.conf.json` for future signed Windows
  release work while keeping the default config suitable for local development
  and the unsigned 0.9.3 Windows preview.
- Added a shared audio-reactive module for defaults, control metadata, presets,
  feature normalization, dense-mix dampening, and render-parameter modulation.
- Added audio-reactive controls for transient/flux amount, presence amount,
  density dampening, and noise floor.
- Added flux and density meters plus a Dense Mix Control audio-reactive preset.
- Added bounded audio feature channels for low-mid, high-mid, presence,
  brightness, and density across browser and native audio paths.

### Changed

- Public macOS release builds now require Developer ID signing and notarization
  instead of falling back to ad-hoc signing.
- Windows 0.9.3 release artifacts are published as unsigned preview builds
  until SignPath Foundation, Azure Artifact Signing, or another signing backend
  is proven.
- Release CI keeps signing credentials scoped to signing steps and gives the
  publishing job the only write-capable GitHub token.
- Audio-reactive beat detection is more conservative during dense, broadband
  passages while preserving strong response for sparse transients.
- Default Pulse Reactor audio settings are stronger and less over-damped so
  modest or dense tracks still produce visible movement without changing saved
  user presets.
- Existing audio-reactive slider ranges are expanded, with matching browser and
  native clamps.
- Browser preview, Pop Out, stream paths, and native output now consume the same
  shared audio-reactive modulation rules.
- Live camera Pop Out keeps the fast native camera path for glyph, solid, and
  pixel presets; browser mirror transport remains reserved for fallback sources
  where native capture is unavailable.
- Native Pop Out now disables glyph masking for WebGL/WebGPU-style presets so
  non-Canvas2D presets keep the same solid cell shape as the main preview.
- Static video/camera transitions can now crossfade between GPU, solid/pixel,
  and Canvas2D glyph renderers without destroying the shared media source.
- Traditional Canvas2D ASCII presets now default to visible static-image jitter
  and migrate saved zero-jitter copies of those built-ins.
- WTF mode now lets ASCII/glyph anchors use their Canvas2D backend again, so
  solid-to-glyph random transitions are visible instead of becoming GPU
  solid-cell variants.

### Fixed

- Fixed a WTF-mode `ReferenceError` when solid/pixel presets biased the next
  random target toward the traditional ASCII anchor presets.
- Fixed Tauri event listener cleanup permissions for the main window and made
  native Pop Out close-listener cleanup rejection-safe, preventing
  `event.unlisten not allowed` crash reports.

### Security

- Future Windows signing uses environment-scoped signing credentials and does
  not commit certificate files, client secrets, or private signing material.
- Audio reactivity still sends only bounded feature vectors through IPC; raw
  audio, frames, media files, and paths remain local.
- Release signing and updater signing checks now treat macOS public
  distribution as a fail-closed path. Windows 0.9.3 artifacts are explicitly
  unsigned previews.

### Validation

- Added `npm run test:audio-reactive`.
- Added `npm run check:windows-authenticode`.
- `npm run check:desktop` and `npm run check:release` now include the
  audio-reactive helper tests.
- Static smoke coverage now asserts that live camera presets do not fall back to
  mirror transport by default.
- Static smoke coverage now asserts that native glyph masking follows the active
  backend family instead of leaking Canvas2D-style glyph output into GPU presets.
- Static smoke coverage now asserts that solid-to-glyph video transitions keep
  playback live instead of pausing during renderer-family rebuilds.
- Static smoke coverage now asserts that WTF solid/pixel targets can
  deterministically bias into ASCII anchors without throwing.
- Static smoke coverage now asserts that traditional Canvas2D ASCII presets
  animate their default static-image jitter and expose the jitter control.
- Tauri policy checks now require main-window event cleanup permission while
  keeping that permission out of the presentation-only output window.

## [0.9.2] - 2026-06-25

### Added

- Added a production-only crash reporter for frontend errors, unhandled
  rejections, Tauri command failures, and Rust panic-hook reports.
- Added reviewed/sanitized crash report preferences: ask, always send, and off.
- Added a Cloudflare Worker crash relay at `crash.dustwave.xyz` that rate-limits
  intake, sanitizes payloads, fingerprints reports, and creates or updates
  aggregated GitHub issues through a GitHub App.
- Added a GitHub crash report issue template and crash relay deployment workflow.
- Added shared renderer math vectors covering GPU color processing and legacy
  Canvas/stream color behavior.

### Changed

- Tauri crash report submission now runs from Rust only; the webview does not get
  arbitrary HTTP capability.
- The output window remains presentation-only and receives no crash-report
  commands.
- Crash relay aggregation now groups by stable crash dimensions, including
  platform and explicit error-code fields when present, before falling back to
  normalized stack or message matching.
- Browser Canvas and stream visuals are intentionally preserved. The 0.9.2
  consolidation work extracts shared helpers and tests first instead of changing
  numerical output.
- Renderer color/hash/charset helpers now live under `renderers/shared/` for
  reuse by app code and tests.

### Security

- Crash reports are bounded and sanitized before local storage or submission.
  Media files, frames, raw audio, full paths, tokens, cookies, and private
  environment values are not included.
- Crash report network submission is disabled for non-production/debug builds.
- GitHub credentials live only in Cloudflare Worker secrets; no GitHub token is
  embedded in the desktop app.

### Validation

- Added `npm run test:render-math` and `npm run test:crash-relay`.
- `npm run check:desktop` and `npm run check:release` now include crash relay and
  renderer math checks.

## [0.9.1] - 2026-06-24

### Added

- Added traditional ASCII-style built-in presets:
  - Classic Camera ASCII.
  - ANSI Newsprint.
  - Terminal Mono.
  - Dense Typewriter.
- Added a Classic Camera character set inspired by the small luminance ramp used
  by `idevelop/ascii-camera`.
- Added native `wgpu` Pop Out glyph rendering for `glyphMode` presets:
  - native output now accepts `glyphMode` and `charset` from the canonical
    renderer params.
  - native GPU output uses a bundled fixed bitmap glyph atlas and charset ramp.
  - native software fallback/test rendering uses the same glyph ramp logic.
- Added Rust coverage for native glyph metadata parsing, render-uniform layout,
  and glyph-mask output.

### Changed

- Traditional ASCII presets select Canvas2D for the main preview so glyphs are
  visible immediately across demo image, demo video, custom media, and camera
  sources while native Pop Out renders matching glyph masks.
- WTF mode can now anchor randomized live-safe targets around the traditional
  ASCII presets as well as the extreme preset families.
- Character Set and Font Family select menus now use the compact select layout
  used by Audio Reactivity controls.
- Native output now preserves text/glyph style for static media and single
  camera sources instead of flattening glyph presets into solid cell blocks.
- Static smoke coverage now asserts that the Glyph/Cell group remains visible
  and compact while rendering the new traditional ASCII presets.
- Hardened media diagnostic redaction for embedded local paths and bounded
  diagnostic message size.

## [0.9.0] - 2026-06-23

### Added

- Renamed and positioned the app as ASCII VJ Remix.
- Renamed the repository/package identity to `ascii-vj-remix` and updated the
  GitHub remote/updater references.
- Added a Tauri v2 desktop app shell around the renderer lab.
- Added a Vite build pipeline so the same vanilla frontend can run in a browser
  or inside the packaged desktop app.
- Added local-first static source workflow:
  - Demo Image as the default startup source.
  - Demo Video as the visible built-in video fixture.
  - custom local image/video file selection.
  - MKV file selection support where the active decoder path can handle it.
  - camera source support.
  - multi-camera selection and local Canvas2D camera mixing.
- Added high-quality renderer backends:
  - WebGPU as the primary browser GPU path.
  - WebGL2 fallback.
  - Canvas2D and pixel Canvas fallbacks.
- Added dense live renderer controls for grid, rows, cell dimensions, color,
  brightness, contrast, gamma, background blend, quantization, jitter, sample
  position, smoothing, FPS, glyph/cell mode, and performance status.
- Added built-in visual presets, including a wider set of extreme high-jitter,
  high-contrast, high-saturation, low-column, low-gamma, and high-gamma looks.
- Added user preset save, copy, update, delete, import, and export workflows.
- Added smooth preset transitions with numeric tweening and renderer-surface
  crossfades.
- Added WTF mode for continuous randomized live-safe transitions.
- Added a Stats Overlay that shows current preset, source, backend, grid, FPS,
  transition time, and audio-reactivity state.
- Added audio-reactive rendering:
  - Mic/Input default source.
  - local audio file source.
  - browser Display Audio where the browser provides audio tracks.
  - native Tauri audio capture paths for desktop builds.
  - RMS, bass, mid, treble, transient, and beat-driven modulation.
  - safe clamps to avoid pure white or pure black outputs at high sensitivity.
- Added native Tauri Pop Out output:
  - separate output window for another screen.
  - native `wgpu` presenter for file-backed video/image sources.
  - Metal path on macOS.
  - D3D12/Vulkan/GLES target support through `wgpu`.
  - native macOS single-camera capture path through AVFoundation for low camera
    latency in Pop Out.
  - output display selection and secondary-display simulation tests.
- Added local-only desktop media selection through a Tauri dialog and
  session-scoped media registry.
- Added production Content Security Policy and split Tauri capabilities.
- Added GitHub Releases updater infrastructure.
- Added ad-hoc macOS app signing as the default local/release fallback.
- Added optional Developer ID notarization workflow scaffolding for future use.
- Added FFmpeg sidecar build/staging policy for standalone media-engine work.
- Added Rust media-engine slices for FFmpeg probing/decoding, frame prep, and
  adaptive stream encoding validation.
- Added static browser smoke tests, output-display tests, updater manifest
  tests, FFmpeg resource policy checks, media parity checks, and Rust tests.
- Added project practice docs for security, performance, testing,
  accessibility, and internationalization.

### Changed

- The normal Source UI now exposes static local sources instead of a visible
  Static/Streaming selector.
- The Source panel now shows Demo Image, Demo Video, Camera, and custom file
  entries only.
- Camera controls now appear directly below Source when Camera is active.
- Stream-only UI such as buffer count and top-right stream connection status is
  hidden from normal static/camera/file use.
- Presets and WTF mode no longer toggle Stats Overlay unless the user changes
  that setting directly.
- Preset transitions preserve active media source and video playback time when
  the source is unchanged.
- The app is now documented as a standalone local-first creative tool rather
  than only as an ASCILINE streaming server fork.
- The UI theme now uses black and graphite surfaces with white active accents,
  neon blue ready/on states, and neon pink warning/WTF/update states instead of
  the previous blue-dominant palette while preserving the compact control
  density and high-contrast status accents.

### Development and Release

- Node.js 24 is the baseline JavaScript runtime.
- Release CI builds on macOS, Windows, and Linux.
- Release CI builds reviewed FFmpeg/ffprobe sidecars from pinned official
  FFmpeg source with network protocols disabled.
- The updater private key is intentionally external and must be supplied through
  `TAURI_SIGNING_PRIVATE_KEY`.
- The updater key is password-protected; release automation now also requires
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- Local macOS builds can use a stable self-signed identity for better TCC
  permission reuse during development.

### Known Limitations

- Stream mode exists as legacy/dev infrastructure but is hidden from the normal
  Source UI until the standalone workflow is fully productized.
- MIDI hardware control is planned but not shipped in 0.9.0.
- Apple Developer ID signing and notarization are deferred.
- Linux WebGPU behavior depends heavily on WebKitGTK, Mesa/vendor drivers, and
  distro packaging; WebGL2 may be the practical Linux fallback.
- MKV support depends on the active platform decoder path.
- System/display audio capture behavior varies by operating system and browser.
