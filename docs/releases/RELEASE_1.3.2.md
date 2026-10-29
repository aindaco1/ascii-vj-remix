# 1.3.2 — Video Soundtrack Playback

Release preparation: 2026-10-29 (America/Denver). The owner requested publication
after confirming that the soundtrack stays audible in the fixed Mac Dev app.

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

## Publication Gates

Exact source CI, public packages/signatures, installer/updater hops, and local
public-build acceptance are pending publication. Record their immutable runs,
artifact hashes, and outcomes here after completion.

Windows/Linux native audio devices remain untested; browser identity simulations
do not establish hardware acceptance. Existing physical transport, older-macOS,
camera/MIDI/display and sustained-performance follow-ups remain in the
[1.3.0 release record](RELEASE_1.3.0.md) and
[hardware checklist](../TESTING.md#hardware-and-platform-checks).
