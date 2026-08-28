# Accessibility

This guide documents the current accessibility baseline and the rules applied
to control-surface changes.

The control UI remains subject to keyboard, labeling, contrast, and focus
requirements. The rendered output is creative media that may intentionally be
high contrast, animated, jittery, and visually intense.

## Current Baseline

Accessibility is early for this project. The current app benefits from:

- high-contrast black, white, grey, neon pink, and neon blue UI colors.
- mostly standard HTML buttons, sliders, select controls, checkboxes, and file
  picker flows.
- compact but visible control grouping.
- persistent Stats Overlay for renderer state.
- polite live status for user-triggered updater checks and available releases;
  silent launch checks do not announce current/offline results.
- a persistent Reports control that keeps crash-report preferences reachable
  before any report is pending.
- platform-native permission prompts for camera, microphone, and system audio.

Known limitations:

- No comprehensive keyboard-only audit has been completed.
- No screen-reader pass has been completed.
- No automated axe/ARIA snapshot suite exists.
- The dense VJ control surface has many sliders and buttons that need stronger
  focus and labeling coverage over time.
- The visual output can include rapid motion, high contrast, jitter, and color
  shifts by design.

## Accessibility Principles

- Preserve control density without sacrificing focus visibility or readable
  labels.
- Prefer native controls before custom widgets.
- Make every interactive control keyboard reachable.
- Keep focus order aligned with visual order.
- Do not rely on color alone for critical state.
- Keep visible focus states strong against the black UI theme.
- Use ARIA only where native semantics are insufficient.
- Keep live status updates polite unless the user must act immediately.
- Do not let aesthetic changes reduce contrast or target size.
- Keep output-window controls minimal and predictable.

## Critical Interaction Surfaces

The highest-risk accessibility surfaces are:

1. Source selection, custom-file selection, and source status.
2. Camera device list and multi-camera selection.
3. Preset buttons, user preset actions, and import/export overflow menu.
4. Sliders and numeric controls across Grid, Color, Sampling, Audio Reactivity,
   and MIDI.
5. WTF mode active/inactive state.
6. Audio Reactivity source/device/preset controls and permission states.
7. Pop Out and fullscreen/output-display controls.
8. Stats Overlay content.
9. Permission recovery and error messaging.
10. MIDI device status, soft-takeover state, SysEx actions, and MIDI Learn.
11. Reports dialog preference, pending count, Send, and Discard actions.
12. Palette, mapping, ordered-dither, density-mode, character-set, typed-ramp,
    and glyph-color controls.

## UI Control Rules

Use these rules for new UI work:

- Buttons need accessible names that match their action.
- Icon-only controls need a label via `aria-label` or equivalent visible text.
- Toggle buttons must expose pressed/on state.
- Sliders need visible labels, accessible labels, min/max/current values, and
  keyboard support.
- Palette and character-set choices need readable text labels; swatches or
  rendered glyph shapes cannot be the only identifier.
- Custom-ramp length and removed/unsupported-scalar feedback must be available
  as text, not conveyed only by a changed preview.
- Advanced Density must identify that it removes the normal performance
  guarantee and must remain operable independently of visual presets.
- Mutually exclusive choices use radio buttons, a select, or an ARIA
  pattern that is tested with keyboard input.
- Checkbox groups need a group label.
- File picker controls announce selected filename/presence state.
- Menus and overflow controls must close with Escape and restore focus.
- Status/error text appears near the triggering control and uses an
  appropriate status or alert region when dynamic.
- Dialogs close with Escape and restore focus to their triggering control.
- Disabled or irrelevant controls are hidden or disabled consistently,
  matching the conditional-knob model.

## Keyboard Expectations

Minimum keyboard behavior:

- Tab moves through controls in a useful order.
- Shift+Tab reverses the same order.
- Enter/Space activates buttons and toggles.
- Arrow keys operate sliders and native selects.
- Escape closes transient menus, popovers, and dialogs.
- Focus is not trapped in the preview/output canvas.
- Opening and closing Pop Out does not steal focus permanently from the main
  controls.

For MIDI Learn and mapping controls:

- mappings must be creatable without pointer input.
- waiting-for-input states must be announced.
- cancel/clear/reset actions must be keyboard reachable.
- connection, active-page, last-message, capture, restore, and verification
  statuses must be exposed through readable live status text.
- Install/Restore must identify that all 33 UC-33e memories are overwritten.
- physical controller use must not be required to disconnect MIDI, cancel Learn,
  remove an override, or reset the built-in map.

## Motion, Flashing, and Visual Intensity

ASCII VJ Remix is designed for extreme visuals, while the control UI remains
readable and operable.

Current rule:

- The app may generate intense visuals when the user selects extreme presets or
  WTF mode, but controls must remain readable and operable.

## Color and Contrast

The current theme uses:

- black/graphite surfaces for structure.
- white as the primary active/focus color.
- neon blue for ready/on/positive states.
- neon pink for warning/update/WTF states.
- red for errors.

Rules:

- Hover states must keep text readable. A light hover background needs dark
  text.
- Focus rings must be visible against both black and grey panels.
- Error and warning states need text/icon/state differences, not color only.
- The logo/light blue legacy color is not the main UI accent.

## Current Automated Coverage

Current checks are indirect:

```bash
npm run build
npm run smoke:static
```

There is no dedicated keyboard, axe, ARIA-snapshot, focus-order, reduced-motion,
or automated contrast suite. Those gaps are also summarized in
[Testing](TESTING.md); prospective accessibility work lives in the
[Roadmap](ROADMAP.md).

## Manual Accessibility Checklist

Before shipping meaningful UI changes:

- Launch the app and use Tab through the full sidebar.
- Confirm Source entries can be selected without a pointer.
- Confirm preset buttons are reachable and have useful names.
- Confirm Import/Export overflow opens, closes, and restores focus.
- Confirm every slider can be adjusted from the keyboard.
- Confirm Palette, Mapping, Ordered Dither, Character Set, and Custom Ramp are
  keyboard reachable and their current values are announced as text.
- Confirm the custom-ramp counter reports the 96-scalar limit and unsupported
  removals without relying on color.
- Confirm WTF mode exposes active/inactive state.
- Confirm audio permission errors are readable and actionable.
- Confirm camera permission errors are readable and actionable.
- Confirm Pop Out can be opened and closed without losing main-window control.
- Confirm hover text remains readable on unselected Source entries.
- Confirm Stats Overlay does not block essential controls.
- Confirm the MIDI panel is keyboard reachable in the desktop app, Learn exposes
  pressed state, and changing device/profile options does not trap focus.

## Accepted Limits

- The rendered ASCII/video output is artistic media and may not be suitable for
  every viewer in every mode.
- Some platform permission dialogs are owned by macOS, Windows, Linux, or the
  embedded webview.
- Camera and audio device names come from the operating system and may not be
  localized or screen-reader friendly.

These limits do not exempt the app controls from keyboard, contrast, labeling,
and focus requirements.
