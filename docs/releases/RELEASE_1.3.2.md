# 1.3.2 — Video Soundtrack Playback

Published 2026-10-29 at 08:11 UTC (02:11 America/Denver). The owner requested
publication after confirming that the soundtrack stays audible in the fixed
Mac Dev app.

## Change

Visual presets previously restored the default mute state, and WTF randomized
both mute and volume. Playback volume, mute, and looping now remain user-owned
across built-in presets, older saved presets, playlists, and WTF. Direct playback
edits still apply during transitions. The fix uses the existing parameter and
preset-exclusion paths; it adds no audio decoder or playback pipeline.

## Local Acceptance

- Reproduced preset-triggered muting in the installed 1.3.1 Mac app.
- The new regression failed before the fix and passed afterward for Mac,
  Windows, and Linux browser platform identities. It covers all 96 built-in
  preset bases, both renderer families, old saved playback settings, WTF, and
  manual changes during transitions.
- A complete 206.583-second local-file browser playback check reached the end
  with mute off and volume unchanged. AAC decoding and packet timing checks
  found no mid-track silence or timestamp gaps. Private media was not uploaded.
- The optimized Mac Dev app preserved audio settings through Canvas/GPU preset
  switches, sustained WTF, and native Pop Out opening/closing. The owner
  confirmed that audio remains audible on this Mac.
- Audio lifecycle, source policy, renderer-resource, preset/backend, playlist,
  offline-bundle, and static-renderer checks passed. The initial concurrent
  static run hit glyph-loading deadlines; the isolated rerun passed.

## Publication and Acceptance

- [Release 1.3.2](https://github.com/aindaco1/ascii-vj-remix/releases/tag/v1.3.2)
  contains 14 assets: notarized Apple Silicon Mac packages, unsigned Windows
  preview installers, Linux packages, updater signatures and `latest.json`.
- [PR #51](https://github.com/aindaco1/ascii-vj-remix/pull/51) passed the
  [four-host PR matrix](https://github.com/aindaco1/ascii-vj-remix/actions/runs/40832180256),
  including Windows renderer/playback regressions and Windows/Linux package
  and native Pop Out checks.
- Tag `v1.3.2` pins source `63d8a7421b220cb94261aa62559e3a8db6debe5c` after
  [exact-main CI](https://github.com/aindaco1/ascii-vj-remix/actions/runs/40836788796)
  passed. The [public release workflow](https://github.com/aindaco1/ascii-vj-remix/actions/runs/40837889145)
  passed all builds, signing/notarization, publication and actual 1.3.1 → 1.3.2
  installer/updater checks on macOS, Windows and Linux.
- Independent downloads on this Mac matched all 14 GitHub SHA-256 digests.
  The updater manifest contains version 1.3.2 and nine platform entries.
  DMG trust/stapling, production identity, updater UI and the previous-version
  replacement check passed locally.
- The installed production Mac app also updated through its real updater from
  1.3.1 to 1.3.2 without forcing a version or update. The updated app passed
  launch, signature and Gatekeeper checks. The separate Dev app remains 1.3.2.

An ffmpeg.org outage exposed a packaging dependency during preparation. The
builder now falls back to the MacPorts archive after failed transfers, enforcing
the same pinned FFmpeg 8.1.2 SHA-256 before extraction. The mirror download matched
that hash, and failed/partial/corrupt-download tests passed on every CI host.
Custom source URLs remain exclusive. See the [release guide](../RELEASING.md).

Machine-readable [publication evidence](evidence/1.3.2-publication.json) records
immutable runs, public asset hashes, bounded playback results and cleanup.

## Cleanup

Removed approximately 4.7 GB of reproducible local debug/smoke/download output,
11 obsolete or completed-build intermediate CI artifacts, and 12 obsolete CI
caches (approximately 2.2 GB remotely). Removed the merged release branch locally
and remotely; `main` is the remaining branch.

Retained the production and Dev 1.3.2 apps, optimized development build cache,
dependencies, `dist`, staged runtimes, pinned SDK cache, current test packages
and current CI caches. Current public packages and one verified signed 1.3.1
Mac rollback archive are in `/private/tmp/ascii-vj-remix-release-testing`.
Published release history, other chats' worktrees and user media/settings remain
available.

## Remaining Physical Acceptance

Windows/Linux native audio devices remain untested; browser identity simulations
do not establish hardware acceptance. Existing physical transport, older-macOS,
camera/MIDI/display and sustained-performance follow-ups remain in the
[1.3.0 release record](RELEASE_1.3.0.md) and
[hardware checklist](../TESTING.md#hardware-and-platform-checks).
