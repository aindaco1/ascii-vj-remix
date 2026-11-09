# 1.3.3 — Distribution notices and licensing groundwork

Published November 9, 2026 at 01:22:31 UTC, with owner authorization to publish
a free release and then clean superseded build output. This remains a free
release; paid licensing and scheduled capture are disabled.

## Scope

- Offline Software licenses panel with original app/component notices and the
  publisher's public-domain demo-footage attestation.
- Locked dependency and FFmpeg sources delivered with each platform release;
  Linux runtime, helper/library sources and launcher scripts verified against
  the actual packaged files.
- Linux AppImage runtime built from pinned source instead of adopting a moving
  runtime binary. Packaging tools remain checksum-pinned.
- Opt-in macOS private-license activation/update groundwork. The normal free
  release retains its public updater and offline rendering; it does not enable
  paid offers or require activation.

## Acceptance record

The prior groundwork is merged in PR #53. Its local release gate, all four
Desktop CI jobs and the separate Developer ID-signed private-update pilot passed.
That disposable pilot is recorded in
[native rotation evidence](../release-evidence/2026-11-08-native-rotation.json);
it is not acceptance of the public 1.3.3 packages.

[PR #54](https://github.com/aindaco1/ascii-vj-remix/pull/54) passed all four
[PR CI jobs](https://github.com/aindaco1/ascii-vj-remix/actions/runs/42538569719)
on `a550cd9da0db44a0dfb34ad7e7a8aa910da795a4`. Its squash merge
`45f8f1a8e7b8cbec9e21bbf3a8d2ba2bf8c713c3` has the same tree and passed
[exact-main CI](https://github.com/aindaco1/ascii-vj-remix/actions/runs/42542018346)
before automation created immutable tag `v1.3.3`.

The [release workflow](https://github.com/aindaco1/ascii-vj-remix/actions/runs/42543256824)
passed all 15 jobs: source acceptance, platform builds, macOS signing and
notarization, packaged notice/source checks, publication, and actual 1.3.2 → 1.3.3
installer/updater tests on macOS, Windows and Linux.
[The public release](https://github.com/aindaco1/ascii-vj-remix/releases/tag/v1.3.3)
contains 22 assets, including four source archives with digest records. Linux's
native offer covers 83 source packages, the pinned runtime and captured launchers.

Independent anonymous downloads of all 22 assets matched GitHub sizes and SHA-256
digests; all four source archives passed file-manifest verification. The Mac DMG
passed signature, notarization staple, Gatekeeper and packaged-notice checks
(733 notice files). Its updater archive retained the same production designated
requirement as 1.3.2: Volver Health LLC, team `PWT3Q52LZ2`.

The installed 1.3.2 app found the public update but showed **Install failed** during
a slow download (last observed progress: 14%). The underlying error was not
exposed, so timeout is a hypothesis, consistent with the five-minute download
limit, rather than a confirmed diagnosis. The independently verified official
DMG installed 1.3.3 successfully; the app reopened with existing settings, rendered
the built-in demo and displayed dark, wrapped Software licenses content. The
original 1.3.2 app remains available for rollback. This local manual-install
acceptance is separate from the successful hosted three-platform updater tests.
See [updater recovery](../USER_GUIDE.md#update-download-fails) and the
[remaining hardening work](../ROADMAP.md#distribution-and-platform-validation).

The [machine-readable publication record](evidence/1.3.3-publication.json)
contains asset hashes, source verification, signing identity, CI and cleanup
receipts. Windows remains an unsigned preview. Existing physical
camera/audio/MIDI/display, older-macOS and performance checks remain scoped
follow-ups in the
[hardware checklist](../TESTING.md#hardware-and-platform-checks).

Paid Entitle sales, production licensing and scheduled licensing capture remain
disabled. The VCR font is retained under the owner's earlier direction; its
paid-distribution clearance remains pending. No paid launch is implied.

## Cleanup

After public release acceptance, removed 34 reviewed generated paths containing
13,499,006,976 allocated bytes (about 12.6 GiB), nine superseded failed-PR
CI artifacts (1,277,336,984 bytes), three task-only stopped containers
and seven task-only images. APFS clones and snapshots can change the amount of
physical disk space recovered.

Removed 13 remote and 12 local merged branches across ASCII, Platform,
Store and Licensing. Each branch passed current-head, no-open-PR, inactive-worktree,
merge-ancestry and squash-tree checks, with retained recovery bundles or main
history. Remote deletion used expected-head leases. The final documentation
branch is removed locally after its commit is fast-forwarded to main.

Retained current production/Dev apps, all current public test artifacts, the
verified 1.3.2 Mac rollback files and original app, dependencies, optimized Rust
release cache, staged runtimes and pinned inputs, small evidence files and recovery
bundles. User media, preferences, signing material, public release history,
recovery stash, unrelated work and other active worktrees were preserved.
