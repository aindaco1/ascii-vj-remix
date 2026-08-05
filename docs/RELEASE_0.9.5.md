# ASCII VJ Remix 0.9.5

Version 0.9.5 expands the traditional ASCII side of the renderer and introduces
an experimental native MIDI control foundation for the Evolution/M-Audio
UC-33e through an iConnectivity mioXC.

## Highlights

- 23 new read-only character presets adapted from ascii.today, including
  Broadway KB, Computer, Doom, Ghost, Modular, Standard, Univers, and Doh.
- A shared bounded character-set catalog used by the controls, Canvas2D
  renderer, WTF anchors, MIDI stepping, and native Pop Out.
- Experimental four-page UC-33e/mioXC DIN MIDI control with 188 default
  bindings, soft takeover, numeric preset entry, MIDI Learn, reconnection, and
  bounded SysEx capture/restore tools.
- Native Pop Out support for resolved character ramps with fixed-atlas safety
  validation.

## MIDI Status

MIDI is experimental in 0.9.5. Automated mapping, transport, safety, and SysEx
packet tests pass, and the mioXC can be opened simultaneously in both
directions on macOS Apple Silicon. The complete physical control sweep and
end-to-end full-bank restore/verification procedure are still pending.

Keep Ensure Profile on Connection disabled until a captured UC-33e hardware
profile has been restored and verified manually. Direct UC-33e USB input and
physical Windows/Linux MIDI validation are deferred.

## Platform Notes

- macOS artifacts are Developer ID signed, notarized, stapled, and verified by
  the release workflow.
- Windows 0.9.5 artifacts are unsigned previews and may show an Unknown
  Publisher warning.
- Linux packages depend on the target distribution's WebKitGTK and graphics
  stack.
- Runtime rendering and media assets remain local-first and offline by default.

See `CHANGELOG.md`, `docs/ASCII_TODAY_PRESETS.md`, and
`docs/MIDI_UC33E.md` for the complete feature and hardware notes.
