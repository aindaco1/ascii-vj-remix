# 1.3.3 — Distribution notices and licensing groundwork

Release preparation started November 8, 2026, with owner authorization to publish
a free release and then clean superseded build output. Publication and installed
acceptance are pending. The current public release remains 1.3.2 until those
stages complete.

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

The 1.3.3 source/CI, public source archives, macOS notarization and public
installer/updater hop will be recorded here after verification. Windows remains
an unsigned preview. Existing physical camera/audio/MIDI/display, older-macOS
and performance checks remain scoped follow-ups in the
[hardware checklist](../TESTING.md#hardware-and-platform-checks).

Paid Entitle sales, production licensing and scheduled licensing capture remain
disabled. The VCR font is retained under the owner's earlier direction; its
paid-distribution clearance remains pending. No paid launch is implied.

## Cleanup

After publication and installer/updater acceptance, retain the current production
and Dev apps, one verified previous Mac release for rollback, dependencies,
optimized development cache, staged runtimes/source inputs and release evidence.
Remove only superseded generated builds and branches proven merged without open
PRs. User media, preferences, signing material, public release history and other
active worktrees remain outside cleanup.
