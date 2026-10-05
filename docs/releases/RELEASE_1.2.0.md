# 1.2.0 — Fractal Accents

Date: 2026-10-04. Status: **release approved; publication pending**.

The owner requested a new release, deployment and cleanup after reviewing the
local implementation. This authorizes the established signed desktop and
updater workflow. It does not establish unperformed physical-device checks.

## Scope

- Six source-aware presets: Threadlight, Silver Etching, Contour Silk, Julia
  Glass, Chromatic Undertow and Phosphor Lace.
- Independent accent style, amount, coverage, placement, scale, motion, audio
  response and curated variation controls. Accents persist across ordinary
  preset changes and work in every optional scene mode; Off explicitly removes
  them. The global Subtle Limit defaults on and remains user-owned.
- Shared bounded Julia accents across WebGPU, WebGL2, native wgpu and Canvas,
  including glyph/monochrome response, small distortions and decaying trails.
- WTF chooses Flat Media 95% of the time and shares the remaining 5% among ten
  scenes. Its independent accent choice is 65% enabled / 35% Off. Candidate
  retries retain both selections.
- WTF checks displayed glyph coverage, dim sources and audio extremes, validates
  its fallback, and holds the previous look when no safe candidate is available.
  Shared frontend/native limits protect shadows while allowing black source
  frames. Bright Output and Subtle Limit remain user preferences.

The catalog is 96 presets: 68 accelerated and 28 explicit Canvas. The original
accent implementation uses the fractal explorer as a visual reference; it adds
no downloaded runtime assets or online rendering dependency.

## Validation before release preparation

See [Fractal Accents validation](../testing/FRACTAL_ACCENTS.md) and its tracked
rendered evidence for the exact scope:

- Desktop checks, shared shaders and 87 Rust tests passed.
- All 96 presets passed the static renderer smoke.
- Spatial checks passed 152 renderer cases, 216 live-control checks and 44 WTF
  selection/retry/fallback checks.
- WTF visibility checks passed 138 final-image readbacks across WebGPU, WebGL2
  and Canvas, using dim footage, all ten scenes and every audio preset.
- The installed optimized macOS Dev app completed the WTF/audio run with native
  Pop Out at 60 FPS, 22 transitions and no native/GPU failures. The earlier
  locked-screen display-link startup failure is recorded separately and excluded.

Exact candidate/main CI, public asset hashes, installer/updater acceptance and
cleanup totals will be recorded after those operations complete. Publication
requires the existing exact-main CI gate and platform packaging checks.

## Remaining physical coverage

Windows/Linux physical camera, audio and GPU checks, external-projector alignment,
physical MIDI, macOS 13 runtime and reference-floor performance remain separate
acceptance items in [Testing](../TESTING.md#hardware-and-platform-checks) and the
[Roadmap](../ROADMAP.md#distribution-and-platform-validation). Windows packages
retain their documented unsigned-preview status. No unperformed hardware check
is counted as a pass.
