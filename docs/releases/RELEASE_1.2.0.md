# 1.2.0 — Fractal Accents

Date: 2026-10-04. Status: **published; source, installer and updater gates passed**.
Source: `v1.2.0` at `323a62169eff9b2d639112d5dfe999a0e2b45fc4`, merged through
[PR #48](https://github.com/aindaco1/ascii-vj-remix/pull/48).

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

## Source acceptance

- The local `check:release` gate passed after synchronizing 1.2.0 metadata,
  including all 87 Rust tests, shared shaders, offline assets, staged FFmpeg,
  updater contracts and macOS package-layout/identity tests.
- [PR Desktop CI](https://github.com/aindaco1/ascii-vj-remix/actions/runs/37247322430)
  passed macOS 26, Xcode 27, Windows and Linux. Windows exercised all 96 presets;
  Windows/Linux test installers and native Pop Out first-frame/reopen checks passed.
- [Exact-main Desktop CI](https://github.com/aindaco1/ascii-vj-remix/actions/runs/37249821040)
  passed all four lanes for the tagged commit. The automatic release workflow
  created the tag only after that result.
- The optimized local Dev app was rebuilt and installed as 1.2.0 with its stable
  development identity. Production settings, media and diagnostic reports remain
  intact.

## Publication and installed-app acceptance

[Version 1.2.0](https://github.com/aindaco1/ascii-vj-remix/releases/tag/v1.2.0)
was published at 01:37 UTC on 2026-10-05 with fourteen assets. The live `latest.json` matches the tagged manifest and
resolves all nine updater entries to signed 1.2.0 packages.

The [release workflow](https://github.com/aindaco1/ascii-vj-remix/actions/runs/37250935142)
passed all fifteen jobs, including downloaded public installer checks and real
1.1.0 → 1.2.0 updater hops on macOS, Windows and Linux. The Mac DMG and app are
Developer ID signed and notarized. Windows installers remain unsigned previews.

Independent local Mac validation matched the published DMG, updater archive,
signature and manifest SHA-256 digests; verified DMG layout, signing, notarization
and stable designated requirements; checked Update/Reports visibility; and
completed a real updater replacement from 1.1.0 to 1.2.0. The public build is
installed in `/Applications/ASCII VJ Remix.app`; it opened with existing settings
and local media and displayed Up to date. The Dev app is also 1.2.0.

The [publication evidence](evidence/1.2.0-publication.json) records the exact
commit, CI jobs, public assets/digests, updater checks and cleanup totals.

## Post-release cleanup

Removed 6.40 GB of local generated output, including the debug build tree,
obsolete smoke/Jev outputs, temporary updater extractions, baseline downloads and
a redundant rollback copy. Removed thirteen redundant/obsolete Actions artifacts
(1.07 GB), retaining the current Windows/Linux development installers and native
smoke reports. The merged `release/1.2.0` branch was deleted locally and remotely;
`main` is the only remaining branch.

Retained the current production and Dev apps, one 1.1.0 production rollback copy,
the optimized release build cache, dependencies, frontend bundle, staged FFmpeg,
current Mac release downloads and tracked evidence. User media, preferences,
reports, signing identities, published release history and other managed
worktrees were excluded. The next debug build regenerates its cache, as described
in [Build cleanup](../CONTRIBUTORS.md#build-cleanup).

## Remaining physical coverage

Windows/Linux physical camera, audio and GPU checks, external-projector alignment,
physical MIDI, macOS 13 runtime and reference-floor performance remain separate
acceptance items in [Testing](../TESTING.md#hardware-and-platform-checks) and the
[Roadmap](../ROADMAP.md#distribution-and-platform-validation). Windows packages
retain their documented unsigned-preview status. No unperformed hardware check
is counted as a pass.
