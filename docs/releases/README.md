# Release Records

These records preserve version-specific scope, implementation plans, release
decisions, and the evidence available at each stage. A historical Pending row
is not a live status report. A publication decision is not physical hardware
acceptance.

Use the [Release and Updater Guide](../RELEASING.md) for the maintained procedure,
[Testing](../TESTING.md) for checks, and the [Changelog](../../CHANGELOG.md) for
shipped changes. The [documentation index](../README.md) covers current guides.

| Version | Record | Evidence boundary |
| --- | --- | --- |
| 1.0.3 | [Camera Pop Out corrective release](RELEASE_1.0.3.md) | Records Windows owner acceptance and the 2026-09-04 Linux physical camera testing deferral. The current follow-up checklist is linked from [Testing](../TESTING.md#hardware-and-platform-checks). |
| 1.0.2 | [Native output lifecycle corrective release](RELEASE_1.0.2.md) | Retains the release contract and macOS common-flow acceptance; it does not establish physical Windows/Linux acceptance. |
| 1.0.1 | [Camera, playlists, screenshots, and Reports](RELEASE_1.0.1.md) | Pre-release snapshot; its Pending CI/public-artifact and hardware rows are preserved as historical evidence. |
| 1.0.0 | [Release readiness and acceptance](RELEASE_1.0.0_RC.md) | Retains local, CI, installed Mac, Windows owner, and Linux VM evidence. VM acceptance does not establish physical Linux camera/audio/GPU coverage. |
| 0.9.11 | [Palette, glyph, and density implementation](RELEASE_0.9.11_PLAN.md) | Completed implementation plan and local M1 Max evidence; reference-floor physical performance acceptance was not claimed. |

When adding a record, state its version, date/evidence stage, exact artifacts,
and acceptance boundaries. Keep reusable procedures in the release guide and
prospective work in the [Roadmap](../ROADMAP.md).
