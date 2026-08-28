# ASCII VJ Remix 0.9.11 Implementation Plan

Status: implemented; local release gates completed on 2026-08-28. Cross-platform
CI, publication, and post-publication acceptance remain release-stage evidence.

Implementation record: all five phases are complete in the release branch.
The selected scope shipped as 16 project-native palettes, three ordered Bayer
modes, one paged neutral atlas covering 34,895 approved scalars, typed ramps
bounded to 96 scalars, a 640-column normal accelerated ceiling, a 900-column
Advanced Density preference, and retuned presets. Matched optimized WebGL2
samples cleared the local 30 FPS/P95 budget on an M1 Max/64 GB host. The
15-minute soak found and drove a fix for occluded-output frame retention; its
fixed repeat held steady RSS within 0.6 MB. This host is faster than the
reference floor, WebGPU was unavailable in its webview, and physical M1/16 GB
and Windows performance acceptance are not claimed.

Version 0.9.11 adds performance-budgeted built-in color palettes, ordered
dithering, expanded glyph controls, custom Unicode ramps, and a generated
multilingual glyph-atlas path shared by the main renderer and native Pop Out.
The release must preserve the existing local-first runtime, canonical parameter
model, renderer fallbacks, media ownership, and native-output latency model.

## Approved Product Scope

- Ship a curated set of 12 to 16 built-in palettes selected from local reference
  color data. Use project-native ids and display names. Do not bundle the
  reference archive, its schema, or its names, and do not add palette import.
- Make palettes independently selectable and reusable by presets. Presets store
  palette ids rather than duplicate color arrays.
- Add nearest-color and luminance-ramp palette mapping.
- Add ordered Bayer 2x2, 4x4, and 8x8 dithering with strength, scale, bias, and
  invert controls. Blue-noise and animated-noise modes are outside 0.9.11.
- Add glyph-set, depth, offset, reverse, glyph-color mode, glyph color,
  background color, and custom typed ramp controls.
- Keep custom ramps bounded to 96 Unicode scalar values. Resolve them to integer
  glyph ids when edited, not during rendering.
- Ship one neutral, legible bundled glyph-atlas style in 0.9.11. Keep atlas
  metadata and renderer bindings capable of adding more bundled styles later.
- Include ASCII, Braille, blocks, box drawing, shapes, arrows, mathematical and
  technical symbols, Latin Extended, Greek, Cyrillic, CJK punctuation and
  radicals, Hiragana, Katakana, CJK Unified Ideographs U+4E00-U+9FFF, and
  Hangul syllables. Extension A and supplementary CJK extensions are deferred.
- Treat multilingual characters as one Unicode scalar per visual cell. Text
  shaping, grapheme clusters, emoji sequences, and readable paragraph layout
  are outside 0.9.11.
- Retune built-in presets that request 700 to 900 columns so their normal mode
  remains inside the measured density envelope while preserving visual intent.
- Add palette-, dither-, Braille-, and multilingual-glyph preset variants only
  after renderer parity is verified. Preserve user-selected media and the
  user-owned Stats Overlay.

## Performance Contract

The reference floor for release claims is an Apple M1 with 16 GB RAM. A
comparable Windows x64 integrated-GPU machine receives automated build and
best-effort physical validation. Linux receives automated build and renderer
smoke coverage without a physical performance gate. Intel macOS is not a
release target.

The primary optimized-build acceptance workload is one local 1080p video with
Audio Reactivity enabled and a 1080p native Pop Out visible at the same time.

- Sustain 30 FPS with P95 frame time at or below 33.3 ms on the reference Mac.
- Keep feature-disabled P95 frame time within two percent of the 0.9.10
  baseline and add no recurring per-frame allocations or texture uploads.
- Keep palette plus ordered-dither P95 frame time within ten percent of the
  comparable non-palette mode at the same resolved grid.
- Keep memory stable during a 15-minute video/Pop Out run after warm-up.
- Preserve control responsiveness, source playback, audio response, and latest-
  frame native output while the workload runs.
- Measure the normal density ceiling instead of assuming that 900 columns are
  sustainable. Base the limit on total cells because auto rows, source aspect,
  and cell aspect make raw columns an incomplete cost measure.

Normal density ends at the measured safe ceiling. A global, machine-level
Advanced Density preference exposes values through 900 columns without a 30
FPS guarantee. Advanced Density is not saved in visual presets. Grid resolution
uses one shared policy; renderers do not invent independent density heuristics.

## DRY Ownership

- `app.js` remains the canonical persisted/effective parameter authority.
- `renderers/shared/character-sets.js` remains the character-set catalog
  authority and gains glyph-set metadata instead of being shadowed by a second
  registry.
- One shared palette catalog owns color data, ids, labels, and swatches.
- One build-time glyph manifest owns Unicode coverage, glyph ids, atlas pages,
  density ordering, and future atlas-style ids.
- One grid policy resolves requested columns/rows into effective dimensions and
  feeds native output through the existing payload path.
- One reference math module and one golden-vector set define palette lookup,
  ordered thresholds, glyph depth/offset, and custom-ramp validation.
- Backend-specific shader code implements the shared contract only where API
  syntax requires it. Tests reject numerical or catalog drift.
- Existing preset, WTF, audio, MIDI, persistence, transition, and native-output
  pathways are extended; none receives parallel feature state.

## Hot-Path Design

- Fuse color adjustment, ordered thresholding, palette lookup, and glyph-luma
  selection into the existing cell pass. Do not add a full-frame render pass.
- Build a compact quantized-RGB-to-palette-index lookup table only when the
  active palette changes. Start at 32x32x32 entries and benchmark visual quality
  before considering a larger table.
- Keep ordered matrices as small immutable constants. Strength, scale, bias,
  depth, offset, and colors are uniform/parameter updates.
- Convert custom strings and catalog ramps to bounded integer-id buffers only
  when the ramp or glyph set changes.
- Generate glyph alpha atlases and density metadata at build time. Do not load
  operating-system fonts or rasterize glyphs in the render loop.
- Load the compact core atlas at startup. Load CJK/Kana/Hangul atlas pages only
  when selected or referenced by a custom ramp, and keep the page cache bounded.
- Reuse existing WebGPU buffers/bind groups, WebGL uniform-location caching,
  native source-version uploads, and coalesced live-control updates.

## Delivery Phases

### Phase 0: Evidence and Review Artifacts

1. Record the exact 0.9.10 optimized baseline for the primary workload and
   fixed density sweep, including P50/P95/P99 frame time, preview/Pop Out FPS,
   source upload/skip counts, CPU/GPU observations, and memory.
2. Add deterministic benchmark fixtures and machine-readable reports so the
   same workload can compare 0.9.10 and 0.9.11.
3. Determine the normal total-cell ceiling. Keep 900-column access behind the
   global Advanced Density preference.
4. Generate a contact sheet of the candidate palettes with neutral temporary
   ids, then select 12 to 16 based on tonal range, color-count coverage, visual
   distinction, and representative source renders.
5. Record atlas size estimates for the complete common Unicode coverage before
   choosing atlas page dimensions and cache limits.

### Phase 1: Shared Models and Reference Math

1. Add palette, dither, glyph, and density fields to the canonical parameter
   model and existing control metadata.
2. Add the shared palette catalog and grid policy.
3. Extend character-set metadata for Unicode coverage and custom-ramp
   validation.
4. Add reference CPU math and golden vectors before shader changes.
5. Preserve legacy output exactly when palette and dither modes are off.

### Phase 2: Renderer Parity

1. Implement the fused palette/dither cell operation in WebGPU and WebGL2.
2. Implement the same contract in Canvas fallbacks without per-cell strings or
   per-frame allocations.
3. Extend native `wgpu` cell processing through the existing parameter/source
   path and retain source-version upload skipping.
4. Compare representative fixed frames across backends within documented
   precision bounds.

### Phase 3: Unicode Atlas and Custom Ramps

1. Add a deterministic offline atlas generator and manifest verifier.
2. Replace the native one-row, eight-bit glyph index path with integer glyph ids
   and paged/grid atlas addressing.
3. Use the same generated atlas metadata in browser GPU renderers and native
   Pop Out where practical; keep Canvas compatibility bounded.
4. Add lazy multilingual page loading, cache limits, unsupported-character
   feedback, and complete common-block coverage tests.
5. Document the future multi-style atlas contract in the Roadmap.

### Phase 4: Controls, Presets, and Live Integration

1. Add compact, keyboard-operable Palette, Dither, and expanded Glyph controls.
2. Save custom ramps and visual parameters in user presets through the existing
   bounded preset schema. Keep Advanced Density global and out of presets.
3. Retune high-density built-ins and add the approved palette/glyph variants.
4. Expose live-safe continuous targets to audio/MIDI only through existing
   metadata and coalescing. Keep discrete palette/glyph navigation bounded.
5. Keep source, Stats Overlay, transition, and WTF ownership unchanged.

### Phase 5: Acceptance and Release

1. Run renderer math, static UI, media, native output, Rust, offline, Tauri
   policy, MIDI, accessibility, and release-version checks.
2. Run optimized 0.9.10 versus 0.9.11 performance comparisons and the 15-minute
   soak. Investigate P95/P99 regressions before accepting averages.
3. Run macOS physical visual/Pop Out acceptance. Run automated Windows and
   Linux builds/smokes and best-effort physical Windows validation.
4. Update README, Changelog, Rendering Engine, Performance, Testing, Security,
   Accessibility, Internationalization, agent guidance, and Roadmap according
   to verified behavior.
5. Advance all package versions to 0.9.11 only after the implementation and
   release gates are ready. Keep signing, notarization, updater, and immutable-
   tag acceptance separate from local validation claims.

## Release Exit Criteria

- Palette/dither-off output remains compatible with 0.9.10 reference vectors.
- WebGPU, WebGL2, Canvas, and native output pass representative parity tests.
- Custom ramps render identically in main preview and native Pop Out for the
  supported catalog.
- The complete approved common Unicode blocks are present, deterministic, and
  lazy-loaded without runtime network or system-font dependencies.
- The normal density range meets the 30 FPS reference workload, high-density
  presets are retuned, and Advanced Density remains explicit and global.
- New controls are keyboard reachable, labeled, and do not rely on color alone.
- Package, active atlas, and steady-state memory costs are measured and
  documented.
- macOS, Windows, and Linux automated release gates pass for the exact release
  commit; public signing, publication, and updater-hop evidence are reported as
  separate acceptance stages.
