# Shared desktop services migration

Source migration only; release and deployment acceptance remain separate.

- Consumer baseline: `a11e7f0c90f22d9ab1ebbaa4a502c0fc3771e534`.
- Previous Platform pin: `60d439b887f1244f82ff232c849d74152b28c776`.
- New immutable commit and exact versions: [platform-desktop.json](../platform-desktop.json).
- Shared surface: Tauri progress/manifest helpers, reviewed-report sender, serialized aggregation and GitHub issue reconciliation.

Keep relay routes, product schemas, fingerprints, authentication, issue text, bindings, storage keys, migration classes, rate limits and operator controls local. Existing Road Notice routing is preserved. App startup and install/restart UI stay local.

## Validation

Before and after: all 53 relay tests plus updater/manifest characterization passed. After: offline Vite bundle, Jev harness, Tauri policy checks and Worker deployment dry-run passed. No relay deployment or live issue creation was performed.

All consumer gitlinks, exact package versions and retained Sparkle lockfile
revisions pass:

```sh
node shared/dust-wave-platform/scripts/check-desktop-consumer.mjs
```

Platform passes its JavaScript suite and clean-checkout recipe tests. Its seven
desktop Swift tests pass independently with Sparkle 2.9.5, 2.9.6 and 2.10.0.
App manifests retain their exact existing Sparkle revisions. Advancing the
full gitlink also carries existing Platform patches; product-owned tests
cover those dependencies.

## Independent rollback

Revert this repository's migration commit, then run
`git submodule update --init --recursive`. This restores the prior adapters,
dependency declaration, gitlink and build/CI configuration together. For a
newly added Platform submodule, Git may leave an untracked checkout directory;
it is no longer a build input after the revert.

No user data or relay storage migration is required. Other applications may
stay on their chosen Platform revisions. A reverse-patch check of the complete
migration records whether the source rollback applies cleanly.

Local source/build evidence does not establish notarization, a signed updater
replacement, physical hardware behavior or deployed GitHub delivery. Use the
existing release runbook before shipping.

## Relay provenance

The extracted relay mechanics are original Dust Wave additions by Alonso.
The author authorized those additions under Platform's MIT license on
2026-09-25. Platform's Desktop Core NOTICE records that permission. Upstream
ASCILINE code is excluded; this repository's retained license is unchanged.
