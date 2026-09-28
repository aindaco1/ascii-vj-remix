# 1.1.0 — Spatial ASCII

Date: 2026-09-28. Status: **local candidate, held for owner manual testing**.
Branch: `release/1.1.0`, based on `caefa8ec9708ff782af9a6a1a4b7946a8953046c`.
No release tag, push, GitHub release, deployment or updater publication is
authorized by this record. Version 1.1.0 is synchronized across npm and Tauri.

## Scope

The candidate adds eight source-preserving looks: Neon Night Drive, Media
Corridor, Wet Coast, Neon Cathedral, Brightness Relief, Orbital Chamber, Edge
Etching and Phosphor Echo. Relief and orbitals are explicitly experimental.
The preset contract is 87 total: 59 accelerated and 28 explicit Canvas.

| Recommendation | Implemented behavior |
| --- | --- |
| Architectural raycasting | Bounded grid traversal, variable building heights, tall-behind-short visibility, roofs, perspective-correct camera-plane rays, floors and ceilings |
| Media on surfaces | One selected image/video/camera texture, repeat/fit/crop framing and procedural/media blend |
| Camera choreography | Forward, street weave and travelling look-around routes, signed speed, freeze, reset and shared preview/native transport |
| Materials and atmosphere | Seeded windows, surface glyphs, directional light, contact darkening, distance fog and analytic emission |
| Wet scenes and weather | A bounded reflected ray for wet floors, animated ripples and four rain sheets clipped against scene depth |
| Edge-directed ASCII | Horizontal/vertical/diagonal glyphs with threshold hysteresis on flat media |
| Feedback | Two reusable float history buffers, elapsed-time decay, zoom/rotation, explicit reset and invalidation on scene/source/layout changes |
| Relief and raymarching experiments | Brightness-driven block heights and a bounded sphere/ring scene; no inferred real-world depth |

All scene code is original. TheProgramOne/3D_Ascii_CIty at
`1612541dc04f89fb8078edc7406838b3e9d3d236` served as a visual reference;
no upstream source, assets, fonts or sound were imported.

The implementation extends existing media, color/palette, glyph, transition,
audio, MIDI and native-output paths. A small shared contract owns controls and
bounds. WebGPU and native wgpu share the scene WGSL; WebGL2 uses a bounded
syntax conversion tested through real shader execution. Canvas supplies the
software reference under its existing density limits. Runtime remains offline.

## Source visibility correction

Manual feedback identified that the first candidate's city/coast/cathedral
looks defaulted to procedural materials, while material glyphs could conceal
source structure even after increasing the blend. The revised candidate uses
85–100% media in all spatial presets, larger wall panels with aspect-aware
framing, media on roofs/ceilings, and a media backdrop for Orbital Chamber.
Material-glyph coverage fades as media contribution rises, leaving source
brightness to select glyphs. Media amount zero retains the procedural option.
Existing saved/custom values are preserved; reselect a spatial preset to load
its revised defaults.

A new regression compares equal-histogram vertical/horizontal source patterns
at the same seed, camera and time. With Bright output enabled, all six scene
presets change 22–60% of output cells by more than 24/255 in at least one RGB
channel, and 20–60% in glyph address. Both WebGPU and WebGL2 pass the actual moving-source upload/readback
check. This measures input sensitivity; it does not substitute for judging
recognizable camera/video content by eye.

![Earlier source-visibility comparison, before the brightness and composition revision](evidence/1.1.0-source-response.png)

## Bright output and preset differentiation

The global **Color → Bright output** toggle is on by default, persists across
launches and remains unchanged by presets, playlists and WTF. It lifts
luminance before glyph selection, with hue-preserving gamut compression.
Source colors are lifted before contrast; palettes retain their lookup and
cycling ranges, then lift the mapped result with stable base glyph luminance.
Dark neutral RGB 16 becomes 139 at neutral color settings;
pure black/white keep their endpoints. Off retains the previous response.
No histogram readback, exposure pumping, extra GPU pass or source restart is
introduced. CPU spatial sampling retains floating-point color until the final
cell conversion so the lift does not magnify early rounding errors.

The six scene presets now have distinct heights, lens angles, speeds and glyph
styles. City drives low and fast; Corridor is narrow and symmetric; Coast has
low shoreline buildings and open water; Cathedral looks upward through a
pitched nave; Relief looks down on solid-cell source-driven terrain without
roads; Orbitals circles a sphere and a tilted rotating ring. Camera tilt is an
editable shared parameter. Reselect a preset to load the revised composition.

The visual review below uses the same bundled demo image reduced to 7.5%
brightness in every panel. Classic Camera ASCII's mean displayed luminance
rises from 3.86 to 18.36 with the toggle (about 4.8×, including black gaps).
This is one recorded fixture, not a universal exposure guarantee. On a separate
common dark pattern, every pair of spatial presets changes at least 72% of
cells by more than 24/255 in RGB at the same grid and time, before glyph style
and density differences. This measures composition difference, not aesthetic
acceptance.

![One dark source, bright output off/on, and the six revised spaces](evidence/1.1.0-bright-spatial.png)

## Deliberate limits

- Traversal is currently per **cell**, capped at 64 steps and 40 world units;
  it is not per final display pixel. A per-column visibility cache from the
  research proposal remains a measured optimization opportunity. This candidate
  uses the simpler common shader to preserve roofs and variable-height
  visibility across backends; it does not claim that optimization is complete.
- Worlds are bounded, periodic 2.5D compositions. There are no bridges,
  overlapping rooms, free flight, world editor or per-surface media files.
- The light/contact/glow terms are artistic approximations. Rain uses sheets,
  not a particle simulation. The map is generated analytically from its seed.
- The existing beat feature drives restrained accents, without a new BPM/bar
  synchronization contract. MIDI still cannot select sources or control Pop Out.
- Native accelerated output renders its own scene. Explicit Canvas scenes use
  the existing mirror path. A missing native GPU does not silently render flat
  media in place of the scene; Canvas is the documented fallback.
- Older WebGL2 devices without float render attachments use byte history with
  an extra decay correction. This prevents stuck trails but changes their fade.

## Local validation

The `npm test` desktop/static stages passed, including desktop/offline checks,
the 87-preset browser matrix and source/transition/palette checks. The hosted
Jev call then returned an incomplete-response error; the bounded
`npm run test:jev` retry passed. Jev received only the maintained synthetic
fixtures, not user media, and is not a visual or hardware acceptance result.
The native Rust suite was rerun after adding the palette regression (81/81).

The optimized macOS development bundle also passed the native WebView
preset sweep: **87/87**, with 59 WebGPU and 28 Canvas presets, no ownership
fallbacks and no failures. Rust/shader, GPU source-response, browser preset and
native performance checks were repeated after the source-visibility correction.
The brightness revision also checks all palette swatches with the toggle on
and off, cycling animation, stable palette glyph luminance and live preference
propagation. The static harness now tests glyph gaps without downsampling and
starts its playback-continuity check away from the 2.5-second demo's loop boundary.
The optimized build passed the 87/87 native sweep again after this revision.
Native trail appearance and preview/Pop Out alignment remain on the owner
manual checklist.

Additional spatial checks exercise DDA corner/axis/empty rays, roofs and
occlusion, camera projection, periodic seams, signed/frozen transport, shared
JS/Rust uniform vectors, bounded audio and floating-point trail decay.
The GPU smoke compares flat plus all six scenes against CPU cell colors on
both WebGPU and WebGL2. It also checks frozen frames, long dim trails, Canvas
density limits, visual MIDI targets, and uninterrupted real-video playback
through the eight new looks and back to Classic Camera ASCII.

Installed Chromium intermittently returned an invalid startup swapchain with
both the baseline WebGPU renderer and this candidate. The numerical harness
therefore starts its app fixture on WebGL2 and explicitly tests WebGPU on an
offscreen attachment; GPU diagnostics still fail the check. This is not a
claim that Chromium's startup warning has been fixed. The native WebView sweep
and native output measurements cover the actual desktop presentation paths.

The optimized native macOS city workload used the bundled 30-second video,
640 columns, Bright output on, 85% source media, wet reflections, rain and
synthetic audio on **Apple M1 Max, 64 GB**, with one physical display.
Existing gates were not relaxed:

| Observation | Result |
| --- | --- |
| Main preview before Pop Out | 39.2 FPS average, 27.80 ms P95 |
| Main preview with Pop Out | 38.6 FPS average, 27.80 ms P95 |
| Main preview during numeric transitions | 36.6 FPS average, 29.65 ms P95 |
| Native presentation, phased run | 60.1 FPS average; zero GPU failures |
| Armed native transitions | 10; zero failures |

The maintained performance smoke passed. The full phased run averaged
38.1 FPS in the preview, with 29.65 ms P95 and 29.65 ms P99. Its minimum sample
was 33.7 FPS, so this is not a guarantee of uninterrupted frame pacing.
These measurements are not acceptance on the M1/16 GB reference floor,
Windows/Linux hardware, a projector, physical cameras or a MIDI controller.

Reproduce with:

```sh
npm test
npm run smoke:spatial
npm run tauri:build:dev -- --bundles app
npm run smoke:primary-presets
ASCILINE_UI_PERF_SMOKE_SPATIAL='{"visualMode":"city","brightOutput":true,"sceneMedia":0.85,"sceneWet":0.55,"sceneRain":0.2}' ASCILINE_UI_PERF_SMOKE_COLUMNS=640 ASCILINE_UI_PERF_SMOKE_SYNTHETIC_AUDIO=1 ASCILINE_UI_PERF_SMOKE_DURATION_MS=18000 npm run smoke:ui-perf
```

Set `ASCILINE_UI_PERF_SMOKE_SOAK=1` for the separate steady workload. Full
procedures and the spatial checklist live in [Testing](../TESTING.md).

## Manual candidate

Local installation: `~/Applications/ASCII VJ Remix Dev.app`, version 1.1.0,
bundle ID `com.asciline.remix.dev`, signed with the existing stable local
development identity. Production installation and public updater are untouched.
Launch it normally, or run `npm run desktop:run-local` to reinstall the current
optimized development bundle through the maintained signing/launch harness.

Before publication, the owner should review:

- Bright output off/on on dark camera, image and video inputs; verify its saved
  preference and compare native Pop Out with the main preview.
- The eight new presets on a selected video and camera, including close walls,
  height changes, reverse travel, pause/reset, and transitions back to old looks.
- Pop Out alignment, external-display fullscreen, reopen/resize and the chosen
  density; compare preview/output motion and source framing by eye.
- Physical audio and UC-33e/mioXC response, saved presets and playlist use.
- Low-light trail decay, material/edge glyph legibility, and the experimental
  relief/orbital compositions on representative footage.

Public signing/notarization, Windows/Linux packages, updater installation and
physical reference-floor acceptance remain separate release gates. This record
does not authorize proceeding past the manual testing hold.
