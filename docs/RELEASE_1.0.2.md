# 1.0.2 Release Readiness and Acceptance

This document tracks the 1.0.2 corrective release and keeps source, CI,
published-artifact, installed-app, and physical-platform evidence separate.

## Release Scope

- Prevent Windows/Linux native Pop Out source and camera-mirror changes from
  reusing an output window until the previous GPU or softbuffer worker exits.
- Convert recoverable `wgpu` surface-configuration validation failures into
  bounded renderer errors instead of Rust panic-hook reports.
- Treat raw window-handle loss during normal close or replacement as teardown
  while preserving unexpected native-output failures in Reports.

## Acceptance Contract

1. Source metadata agrees on version 1.0.2 and the release tag is `v1.0.2`.
2. The exact release commit passes the macOS, Windows, and Linux Desktop jobs.
3. The release workflow publishes the complete 14-asset contract: macOS DMG
   and updater archive, Windows EXE/MSI, Linux AppImage/deb/rpm, signatures,
   and `latest.json`.
4. The downloaded macOS artifact is Developer ID signed, notarized, stapled,
   Gatekeeper-accepted, and contains the documented `/Applications` shortcut.
5. Published macOS, Windows, and Linux install/updater smoke jobs pass against
   GitHub Release assets rather than local build directories.
6. `latest.json` reports 1.0.2 and every referenced updater package and
   signature is publicly retrievable.

## Manual Regression Sequence

On Windows and Linux, keep Pop Out open while switching repeatedly between Demo
Image, Demo Video, and Camera. Close and immediately reopen Pop Out after that
sequence. The app must not panic with `Surface::configure Invalid surface` or
queue an `underlying handle is not available` report during normal teardown.

The user completed the affected common-flow regression pass on macOS before
authorizing the release. That result is macOS acceptance only; CI install and
updater smoke validates packaged platform mechanics, while physical Windows and
Linux hardware behavior remains a separate observation.
