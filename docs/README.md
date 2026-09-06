# Documentation

Start with the repository [README](../README.md) for an overview, installation,
and first run. This index separates current guides from version-specific
release records and benchmark evidence.

## Using the App

| Guide | Purpose |
| --- | --- |
| [User Guide](USER_GUIDE.md) | Current controls and features, system requirements, hardware, permissions, privacy, and troubleshooting. |
| [UC-33e and mioXC MIDI](MIDI_UC33E.md) | Experimental hardware connection, mapping, MIDI Learn, and SysEx procedures. |
| [ascii.today Character Presets](ASCII_TODAY_PRESETS.md) | Included ramps, source credits, and the preset-pack contract. |
| [Changelog](../CHANGELOG.md) | Released and unreleased changes. |
| [Roadmap](ROADMAP.md) | Prospective work and deferred validation. |

## Development and Architecture

| Guide | Purpose |
| --- | --- |
| [Contributor Guide](CONTRIBUTORS.md) | Setup, local development, app identity, FFmpeg, Podman, and contribution workflow. |
| [LLM Agent Guide](AGENTS.md) | Context-loading order, constraints, source ownership, and safe editing. |
| [Rendering Engine](RENDERING_ENGINE.md) | Source/parameter flow, renderer backends, native output, audio, and MIDI architecture. |
| [Release and Updater Guide](RELEASING.md) | Reusable packaging, signing, publication, artifact acceptance, and updater procedures. |

## Testing and Project Practices

| Guide | Purpose |
| --- | --- |
| [Testing](TESTING.md) | Validation commands, check selection, manual checks, hardware coverage, and known gaps. |
| [Linux VM QA](LINUX_VM_QA.md) | VM setup, package retrieval, and virtual-platform acceptance. |
| [Performance](PERFORMANCE.md) | Performance contracts, measured behavior, benchmarks, and regression signals. |
| [Security](SECURITY.md) | Local-media boundaries, permissions, reports, signing, capabilities, and sidecars. |
| [Accessibility](ACCESSIBILITY.md) | Keyboard/focus/label/contrast expectations, coverage, and manual audit checklist. |
| [Internationalization](I18N.md) | Current English UI, string ownership, and multilingual glyph boundaries. |

## Records and Component Documentation

- [Release records](releases/README.md) preserve version-specific plans, decisions,
  and evidence. Historical pending rows are not current release status.
- [Performance evidence](performance/) contains dated benchmark reports;
  [Performance](PERFORMANCE.md) explains their workloads and limits.
- [Crash relay](../crash-relay/README.md) owns Worker setup and aggregation details.
- [Bundled FFmpeg resources](../src-tauri/resources/ffmpeg/README.md) documents
  sidecar layout and provenance.
- [GNU Unifont source](../third_party/unifont/README.md) retains glyph-source
  provenance and its adjacent license notices.

## Maintaining Documentation

Keep `README.md`, `LICENSE`, and `CHANGELOG.md` at the repository root. Put shared
project guides under `docs/`; keep component READMEs and third-party notices
beside the code or assets they describe. The release workflow watches the root
`CHANGELOG.md` path.

Update the guide that owns the subject, then link to it from other entry points.
Keep the root README concise. The user guide owns detailed user behavior, the
contributor guide owns setup, Testing owns check selection, and the release
guide owns the release procedure. Keep historical decisions under `releases/`
and proposals in the Roadmap. Preserve evidence boundaries when reorganizing.

For moves, update relative links, heading anchors, and workflow/script path
references together. Validate local links and run `git diff --check`.
