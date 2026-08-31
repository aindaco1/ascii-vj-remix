# ASCII VJ Remix Roadmap

This document contains prospective work only. It is not a description of the
current product and it does not promise a release date or version. Current
behavior belongs in the [README](../README.md) and practice guides; completed
work and release history belong in the [Changelog](../CHANGELOG.md).

## Distribution and Platform Validation

- Add Authenticode signing and timestamping for Windows installers when a
  sustainable signing provider and release policy are in place.
- Validate Windows SmartScreen behavior on clean machines after signed
  distribution begins.
- Run install, launch, and updater-hop smoke tests on representative physical or
  virtual Windows and Linux machines.
- Validate Linux AppImage, deb, and rpm packages across a maintained distro
  matrix.
- Confirm macOS privacy grants survive an identity-stable public updater hop on
  a clean machine.
- Decide whether Windows releases need a fixed WebView2 runtime for offline
  installation.

## MIDI Controllers and Profiles

- Validate the existing UC-33e/mioXC DIN profile on Windows and Linux hardware.
- Evaluate direct UC-33e USB support separately from the documented DIN/mioXC
  path.
- Add a user-shareable mapping-profile import/export format with bounded schema
  validation and no media paths.
- Evaluate additional controller profiles after the existing mapping, soft
  takeover, reconnect, and SysEx safety contracts remain covered.
- Evaluate per-binding deadband and smoothing controls.
- Evaluate safe editing of UC-33e SysEx without requiring a previously captured
  full-bank dump.

## Productized Stream Mode

- Decide whether a normal-user stream source uses the Rust/FFmpeg session path,
  a bundled sidecar, an external connector, or a reviewed combination.
- Keep Python/FastAPI as development/reference infrastructure unless it becomes
  an explicitly packaged component.
- Design a clear Stream source workflow that does not complicate the default
  local Source panel.
- Restore stream-specific metrics only where they help users diagnose buffer,
  codec, bandwidth, or latency behavior.
- Preserve native output, preset transitions, and bounded control-message
  behavior in the stream path.
- Add end-to-end stream tests before exposing the mode in the normal UI.

## Native Audio Capture

- Evaluate Core Audio Taps on macOS for system-audio capture with a narrower
  permission surface.
- Add WASAPI loopback on Windows.
- Add PipeWire or PulseAudio system-audio providers on Linux.
- Keep audio processing local and pass bounded feature frames rather than
  unbounded raw samples across Tauri IPC.

## Camera and Native Texture Paths

- Evaluate AVFoundation/CVPixelBuffer-to-Metal texture sharing on macOS.
- Evaluate Media Foundation-to-D3D texture sharing on Windows.
- Evaluate PipeWire/V4L2-to-Vulkan or GLES interop on Linux where practical.
- Add native multi-camera composition without forcing every path through
  WebView canvas readback.
- Preserve latest-frame behavior so live output does not accumulate stale
  camera frames.

## Renderer Consistency and Performance

- Define a renderer parameter schema shared by UI controls, presets, audio,
  WTF, MIDI, browser renderers, stream renderers, and native output.
- Reduce remaining duplicated color and quantization behavior across WebGPU,
  WebGL2, Canvas, stream, and native `wgpu` paths.
- Add golden-output or bounded visual tests for representative presets.
- Add a persistent in-canvas fallback indicator beyond the current Stats
  Overlay and bounded Reports diagnostics.
- Add repeatable optimized-build benchmarks for main preview and Pop Out.
- Add synthetic timestamped camera-latency and audio-response tests.
- Track frame rate, frame drops, upload/skip counts, and parameter propagation
  with comparable benchmark output.
- Repeat the 0.9.11 1080p/audio/native-output workload on the Apple M1/16 GB
  reference floor and a comparable physical Windows integrated-GPU machine;
  retain automated Windows/Linux build and renderer smokes between physical
  checks.
- After the first neutral bundled Unicode atlas style ships, add optional
  project-owned atlas styles without changing glyph-set ids, Unicode coverage,
  custom-ramp semantics, or renderer bindings. Keep styles build-time generated,
  locally bundled, lazily loaded, and subject to explicit package/GPU-memory
  budgets rather than introducing runtime system-font lookup.
- Evaluate CJK Extension A and supplementary-plane atlas support only with an
  explicit package/GPU/cache budget. The current direct BMP scalar id contract
  must be versioned rather than silently stretched.
- Evaluate grapheme clusters, script shaping, bidirectional layout, and emoji
  sequences separately from single-scalar visual ramps. None should enter the
  cell hot path without measured performance and clear creative behavior.

## Presets and User Profiles

- Add user-preset rename, optional user-selected startup behavior, and
  folders/tags.
- Separate visual preset packs from MIDI mapping profiles.
- Improve import validation with readable, localized errors.
- Evaluate export bundles containing visual presets, audio-reactive settings,
  and mapping profiles without private media paths.

## Accessibility

- Complete keyboard-only and screen-reader audits of the control surface.
- Add automated keyboard, focus-order, ARIA, and contrast checks.
- Evaluate reduced-motion behavior for control-surface transitions.
- Evaluate a photosensitivity option that limits extreme flicker or jitter in
  randomized modes.
- Evaluate warnings and preset exclusions for intentionally intense WTF output.

## Internationalization

- Introduce a bundled string catalog only when there is a maintained
  translation workflow.
- Keep stable ids, device names, file names, MIDI bytes, and user-authored names
  independent from localized display strings.
- Add missing-key, unused-key, locale smoke, and compact-layout checks with the
  first supported app locale.
- Localize permission, installer, updater, error, and accessibility text as part
  of each supported locale.
- Keep translation catalogs bundled locally with no runtime translation service
  or CDN dependency.

## Documentation and Examples

- Add maintained screenshots for setup, permissions, the control surface, and
  Pop Out.
- Add hardware setup guides for cameras, audio interfaces, projectors, and the
  UC-33e/mioXC rig.
- Maintain a troubleshooting matrix for permissions, GPU fallback, codecs, and
  output-window issues.
- Keep README, renderer, security, performance, testing, accessibility, and
  internationalization documentation aligned with verified behavior.

## Planning Constraints

- WebGPU support varies across Tauri webviews and platforms.
- Linux GPU, camera, audio, and package behavior varies by distribution and
  driver stack.
- Multi-camera capture depends on camera firmware, USB topology, and operating
  system behavior.
- macOS privacy grants remain sensitive to bundle identity and signing.
- FFmpeg licensing and configuration remain release gates.
- Native media decode and GPU interop differ substantially across platforms.
- High-rate structural MIDI mappings can create renderer churn despite
  coalescing and rate limits.
- Stream mode requires a complete user workflow before it can return to the
  normal Source panel.
