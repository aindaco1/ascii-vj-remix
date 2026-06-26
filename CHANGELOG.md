# Changelog

Version 0.9.3 moves public desktop releases to signed/notarized macOS
distribution, publishes Windows as an unsigned preview while signing is
deferred, and expands audio reactivity with dense-mix controls that reduce
overreaction on busy music. Version 0.9.0 remains the first documentation
baseline for the current ASCII VJ Remix feature set.

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
