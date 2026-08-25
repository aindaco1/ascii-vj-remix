# Experimental UC-33e and mioXC MIDI Control

ASCII VJ Remix includes experimental native MIDI control for an
Evolution/M-Audio UC-33e connected through an iConnectivity mioXC. The current
reference path is DIN MIDI on macOS Apple Silicon. Direct UC-33e USB input is
not supported.

The software mapping and transport layers are covered by automated tests, but
the complete physical control sweep and end-to-end full-bank SysEx
restore/verification procedure are not release-certified. Treat profile
installation as experimental, keep Ensure Profile on Connection off until a
manual restore succeeds, and retain a known-good hardware dump.

## Hardware Connection

Use both DIN directions:

```text
UC-33e MIDI OUT -> mioXC MIDI IN
mioXC MIDI OUT -> UC-33e MIDI IN
UC-33e -> dedicated power adapter
mioXC -> Mac through USB
```

The return connection is required for installing and verifying the full-bank
SysEx profile. ASCII VJ Remix accepts only input and output ports whose names
contain `mioXC` in this release.

## Safety and Scope

- MIDI controls visual parameters, audio-reactive settings, visual presets,
  and WTF mode.
- MIDI does not select media, start Camera, open Pop Out, or change output
  displays.
- Soft takeover is enabled by default because the UC-33e controls are absolute
  and are not motorized.
- Installing the ASCII VJ profile overwrites all 33 UC-33e memories.
- Profile installation is explicit. Optional Ensure Profile on Connection is
  off by default.
- A received UC-33e memory dump does not affect the current surface until a
  hardware preset is recalled. Press quick preset 1 after installation.

## Canonical Hardware Programming

The built-in software profile expects the same controller-number layout in all
four UC memories:

| Physical control | MIDI assignment |
| --- | --- |
| F1-F9 | CC 1-9, value 0-127 |
| C10-C33 | CC 10-33, value 0-127 |
| Numeric keys 0-9 | UC controls C34-C43 / CC 34-43, release 0, press 127 |
| Stop, Play, Rewind, Fast-forward | UC controls C44-C47 / CC 44-47, release 0, press 127 |

Assign each control to the UC global channel (`00` at the individual-channel
level), then store four hardware memories:

| Quick preset | UC memory | Global MIDI channel | ASCII VJ page |
| --- | ---: | ---: | --- |
| 1 | 01 | 1 | Visual |
| 2 | 02 | 2 | Audio |
| 3 | 03 | 3 | Presets |
| 4 | 04 | 4 | Fine / User |

The MIDI monitor is the authority during hardware setup. If the controller's
printed button numbering or an existing memory differs, use MIDI Learn or
reassign the underlying transmitted CC so the observed channel/CC matches this
table.

## Resume Commissioning: Exact Front-Panel Procedure

`CONTROL SELECT` in the manual means the one physical button labeled `SELECT`
on the UC-33e. Press it once; do not press Control plus Select, do not hold it,
and do not combine it with another button. The combined functions printed under
brackets, such as `GLOBAL CHAN` and `MEM. DUMP`, are the ones that require two
buttons at the same time.

There is no Enter key while editing. After you type a valid value, either begin
the next function or wait about three seconds for the flashing edit indicator to
stop.

### 1. Program F1-F9 and C10-C33

For each fader and rotary control:

1. Move the physical control. Its printed F/C number appears as the small
   selected-controller number in the LCD.
2. Press `ASSIGN` once.
3. Enter the matching CC number on the numeric keypad: F1 becomes CC 01, through
   F9/CC 09, then C10/CC 10 through C33/CC 33.
4. Press `CHANNEL` once and enter `00`. Channel 00 means “use this memory's
   global channel.”

### 2. Program the 14 buttons as momentary CC messages

Do not assign a button directly to standard CC 34-47. On the UC-33e that mode
toggles between two values on consecutive presses. ASCII VJ Remix needs a 127
press edge and a 0 release edge, so each button must use extended mode 146.

Repeat this sequence for C34 through C47:

1. Press `SELECT` once, then type the controller number, such as `3`, `4` for
   C34. This selection method is required for the numeric keys because those
   keys enter numbers while edit mode is active.
2. Press `ASSIGN` once, then enter `146` (extended momentary MIDI CC mode).
3. Press `PROGRAM` twice, then enter the CC number to transmit.
   Use CC 34 for C34, CC 35 for C35, through CC 47 for C47.
4. Press `DATA MSB` twice, then enter `127` (button press value).
5. Press `DATA LSB` twice, then enter `000` (button release value).
6. Press `CHANNEL` once, then enter `00` (use the memory's global channel).

For the unit already inspected in this project, C34-C43 are physical numeric
keys 0-9 and C44-C47 are Stop, Play, Rewind, and Fast-forward. The LCD's small
number identifies the selected UC control; the large value is its assignment or
current value, depending on edit state.

### 3. Store the four channel pages

The controller assignments are identical on all four pages, so program them
once and store four copies with different global channels:

1. Press `ASSIGN` and `CHANNEL` simultaneously, release them, and enter `01`.
2. Press `STORE` once and enter `01`.
3. Press `ASSIGN` and `CHANNEL` simultaneously and enter `02`; press `STORE`
   and enter `02`.
4. Repeat for global channel/memory `03`, then global channel/memory `04`.
5. Press quick preset buttons 1, 2, 3, and 4 in turn. Move F1 after each recall
   and confirm the app's MIDI monitor reports channels 1, 2, 3, and 4.

Do not hold the `+` and `-` keys while powering on; that restores factory
presets and erases the work above.

### 4. Verify messages before capturing SysEx

1. In ASCII VJ Remix, open **MIDI Control · Experimental** and click `Connect`.
2. Recall quick preset 1.
3. Move F1 and confirm the monitor reports channel 1, CC 1, with changing
   values.
4. Press and release numeric 0 and confirm channel 1, CC 34, value 127 followed
   by value 0.
5. Press and release Stop and confirm channel 1, CC 44, value 127 followed by
   value 0.
6. Repeat one fader and one button on quick presets 2-4 and confirm channels
   2-4.

If a button alternates 127/0 only on separate presses, reprogram it with mode
146; it is still in standard toggle mode.

## Page 1: Visual

### Faders

| Control | Target |
| --- | --- |
| F1 | Columns |
| F2 | Brightness |
| F3 | Contrast |
| F4 | Saturation |
| F5 | Gamma |
| F6 | Background blend |
| F7 | Jitter amount |
| F8 | Jitter speed |
| F9 | Audio sensitivity |

### Rotary controllers

| Control | Target |
| --- | --- |
| C10 | Rows |
| C11 | Cell width |
| C12 | Cell height |
| C13 | Aspect correction |
| C14 | Target FPS |
| C15 | Quantize bits |
| C16 | Sample X |
| C17 | Sample Y |
| C18 | Transition duration |
| C19 | Media volume |
| C20 | Visual intensity macro |
| C21 | Audio smoothing |
| C22 | Beat amount |
| C23 | Bass amount |
| C24 | Mid amount |
| C25 | Treble amount |
| C26 | Transient / flux amount |
| C27 | Presence amount |
| C28 | Density dampening |
| C29 | Noise floor |
| C30 | Audio-reactive preset |
| C31 | Character set |
| C32 | Font family |
| C33 | Renderer backend |

### Buttons

| Control | Action |
| --- | --- |
| 0 / C34 | Previous visual preset |
| 1 / C35 | Next visual preset |
| 2 / C36 | Toggle WTF mode |
| 3 / C37 | Toggle Audio Reactivity |
| 4 / C38 | Toggle glyph mode |
| 5 / C39 | Toggle solid mode |
| 6 / C40 | Toggle texture smoothing |
| 7 / C41 | Toggle automatic rows |
| 8 / C42 | Next character set |
| 9 / C43 | Next font family |
| Stop / C44 | Previous audio-reactive preset |
| Play / C45 | Next audio-reactive preset |
| Rewind / C46 | Reset the selected visual preset |
| Fast-forward / C47 | Re-arm soft takeover |

## Page 2: Audio

F1-F9 directly control Sensitivity, Smoothing, Beat, Bass, Mid, Treble,
Transient/Flux, Presence, and Density Dampening. C10-C33 retain useful grid,
color, sampling, and audio controls so every continuous controller remains
active.

The six numbered buttons 4-9 (C38-C43) directly select the six built-in
audio-reactive profiles. The remaining buttons toggle audio/WTF, step through
audio or visual presets, reset audio settings, and re-arm soft takeover.

## Page 3: Presets

The ten numeric buttons provide deterministic preset-slot entry:

| Control | Action |
| --- | --- |
| Numeric keys 0-9 / C34-C43 | Digits 0-9 |
| Stop / C44 | Clear the current entry |
| Play / C45 | Enter/apply |
| Rewind / C46 | Previous preset |
| Fast-forward / C47 | Next preset |

Examples:

```text
0, 7, Enter       -> preset slot 7
3, 6, Enter       -> preset slot 36
1, 2, 8, Enter    -> preset slot 128
```

Slots use stable preset ids stored separately from the visible sidebar order.
New user presets append to the available MIDI slots without changing existing
slot assignments.

## Page 4: Fine / User

Page 4 starts with narrower ranges for high-impact visual controls. It is
intended for fine brightness, contrast, saturation, gamma, background, jitter,
and sampling adjustments. MIDI Learn overrides can replace any built-in
binding without reprogramming the UC-33e.

## Soft Takeover

When a visual preset or software control changes a mapped value, the physical
control is unlatched. It begins controlling the target only after it reaches or
crosses the current software value. Press C47 on pages 1, 2, or 4 to re-arm all
continuous bindings manually.

## MIDI Panel

The desktop-only MIDI Control panel provides:

- mioXC input/output selection and connection state.
- Active page and last-message monitor.
- Soft takeover and Ensure Profile on Connection preferences.
- SysEx Capture, Install/Restore, and Verify actions.
- MIDI Learn target selection and custom-binding removal.
- Reset Map to restore the four-page built-in mapping.

Custom bindings, device preferences, captured SysEx, and preset-slot order are
stored locally. They do not contain media paths and are never uploaded.

The front-panel sequences in this guide are cross-checked against the
[UC-33e Advanced User Guide](https://cf3.zzounds.com/media/uc-33e_advanced_user_guide_snglpg-0140c97029f79a42f54172fa10108e55.pdf)
and the
[UC-33e Getting Started guide](https://www.manuallib.com/download/EVOLUTION-UC-33-GETTING-STARTED.PDF).

## SysEx Capture and Restore

The UC-33e public documentation describes full-memory transfer but not the
proprietary byte layout. ASCII VJ Remix therefore treats the verified dump as
opaque bounded packets.

To create and prove the canonical profile:

1. Leave **Ensure profile on connection** off.
2. Program, test, and store memories 01-04 using the procedure above.
3. Confirm both mioXC DIN directions are connected and click `Connect` in the
   app.
4. Click `Capture Profile`.
5. On the UC-33e, press `DATA MSB` and `STORE` simultaneously. The bracket
   beneath those buttons is labeled `MEM. DUMP`.
6. Wait until the dump activity stops, then click `Finish Capture`.
7. Click `Install / Restore` and confirm the warning that all 33 UC memories
   will be overwritten.
8. Wait for restore completion, then press quick preset 1. A received dump does
   not alter the active surface until a preset is recalled.
9. Click `Verify`, press `DATA MSB` and `STORE` simultaneously again, wait for
   the dump to finish, and click `Finish Verify`.
10. Only after verification succeeds, optionally enable **Ensure profile on
    connection**, disconnect/reconnect the mioXC once, recall quick preset 1,
    and repeat the F1/numeric-0/Stop message checks.

Ensure Profile on Connection sends the stored verified profile once after each
mioXC reconnection. It never sends repeatedly while the interface remains
connected.

## Testing and Diagnostics

List and open the physical mioXC ports without launching the app:

```bash
npm run midi:probe
npm run midi:probe -- --connect
```

Run mapping and native tests:

```bash
npm run test:midi
npm run test:rust
npm run check:tauri-policy
```

Hardware checklist:

1. Confirm `mioXC` appears as one input and one output.
2. Sweep F1-F9 and C10-C33 through both endpoints.
3. Confirm every C34-C47 press produces one value-127 event and release
   produces value 0.
4. Recall quick presets 1-4 and confirm the next message uses channels 1-4.
5. Confirm soft takeover prevents jumps after a visual preset change.
6. Enter preset slots 7, 36, and 128 or an intentionally empty slot.
7. Unplug and reconnect the mioXC and confirm automatic reconnection.
8. Capture, restore, recall preset 1, and verify the full SysEx bank.
9. Confirm source, Camera, Pop Out, and output display never change from MIDI.

Prospective direct-USB, cross-platform hardware, controller-profile, and SysEx
work is tracked in the [Roadmap](ROADMAP.md).
