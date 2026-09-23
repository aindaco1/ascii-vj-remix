# Jev integration verification — 23 September 2026 UTC

This change adds development testing to the existing 1.0.5 source tree. It does
not change desktop behavior, the app version, installers, or updater metadata.
[Testing](../TESTING.md#jev-development-testing) owns setup and command usage.

## Shared package and scope

Request construction, bounded Cloudflare transport, response validation and
review decisions come from Platform Test Core 0.3.0 at
`60d439b887f1244f82ff232c849d74152b28c776`.
[Platform PR 46](https://github.com/aindaco1/dust-wave-platform/pull/46) merged on
23 September. The consumer retains that exact tested pin.

Six component cases execute existing renderer fallback/report code,
smoke-diagnostic capture and the updater controller with synthetic inputs.
Fourteen known-answer controls exercise the judge. Credentials stay local;
private logs, media, screenshots and actual update transactions are excluded.
The review threshold remains provisional, and model changes or uncertain
answers require review. This does not establish visual or hardware acceptance.

## Local results

| Check | Result |
| --- | --- |
| Existing desktop gate | Passed, including 77 Rust tests and the development binary build |
| Existing browser smoke | Passed with Chromium 153.0.8010.12 and no reported browser errors |
| Jev harness | All six tests passed, covering response/control failures, review routing, dry run, credentials and workflow failure propagation |
| Final offline preview | Zero network attempts; explicitly incomplete |
| Final live Jev | 14/14 controls and 6/6 behavior cases passed with `jev-1.13.0` |
| Final live usage | 20 requests; 8,911 input and 800 output tokens reported by the provider |
| Source identity | Every recorded source hash matched after the final evaluation |

The initial default `npm test` run completed the desktop and browser checks but
correctly exited nonzero when Jev falsely accepted a negative diagnostic-capture
control. The original question asked whether failures were distinguished. The
revised question explicitly requires retaining renderer startup as failed.
Two new paraphrases were fixed before the revised live run. No confidence
threshold was lowered, and the initial result was retained. The revised harness,
offline preview and live evaluation passed separately; the unchanged desktop
and browser gates were not repeated merely for a rubric change.

These small engineering-labeled controls are regression evidence, not
independent calibration. Future prompt tuning needs fresh validation examples.

## Retained evidence

Ignored local `jev-results/` contains:

- `development.log`: the complete initial default workflow, including its
  correctly blocked semantic result.
- `2026-09-23T04-53-40-127Z/`: the initial live review and raw responses.
- `2026-09-23T04-54-58-844Z/`: the final live requests, raw responses, source
  hashes, JSON report and human-readable review.

The final `report.json` SHA-256 is
`01b47a3be0961d6b5b2dd52a8ae0e2c5de9eb07b1e80cde9e10113d5827b85ec`.
No token or account identifier is present in that report. Each result has
`releaseAccepted: false`; CI and source publication are separate checks.

## Cleanup and rollback

Keep the current dependencies, pinned shared checkout, FFmpeg binaries and
provenance, test media, local authentication configuration and the two live
evidence sets. Disposable request previews, generated web output and obsolete
iCloud conflict copies can be removed recoverably. Preserve valid worktrees
and unmerged branches. Current Rust debug build caches support local development;
`npm run build` regenerates web output before browser tests.

Rollback removes the Jev scripts and npm commands, submodule, CI harness step
and associated documentation together. It requires no desktop release or data
migration.
