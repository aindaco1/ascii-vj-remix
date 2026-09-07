# ASCII VJ Crash Relay

## MKV Magic adapter

Local implementation (2026-09-07): `GET /mkv-magic/review` hosts an explicit
browser review; `POST /v1/mkv-magic/reports` accepts the strict 4 KiB
`mkv-magic-issue-report-v1` projection. It routes only to `aindaco1/mkv-magic`.
MKV intake stays disabled until the existing GitHub App installation has Issues
read/write access to that repository and synthetic deployed acceptance passes.
No private user report is used for this acceptance.

MKV Magic remains a sandboxed local app without network client/server entitlements.
It hands bounded sanitized JSON to the fixed browser page in a fragment, never
in a query. The page clears the fragment, validates it using the same function as
the Worker, renders text only, and requires **Send Reviewed Report**. Opening the
page makes no report POST. A single session-storage pending payload supports
explicit retries with the same ID; discard is disabled while a request is in
flight. The page uses a nonce CSP, same-origin connections, no referrer, and no
cache. Browser connection metadata is used for abuse prevention, not copied into
issues. Native crash import accepts only a bounded allowlisted summary, not raw
incident files or stack traces.

`ReviewedReportGroup` and the reviewed intake helper are shared by MKV and Podcast
Visualizer. The original Podcast Durable Object class, namespace, and stored keys
are unchanged. `mkv-reports-v1` adds only `MkvReportGroup`; never delete a prior
namespace/migration to roll this feature back. Disable `MKV_REPORTS_ENABLED`
instead. Retention, uncertain-create reconciliation, and provider-failure behavior
are the same as documented below for Podcast Visualizer. Native crash fingerprints
include build/OS and relative frame offsets; workflow symptoms group across patch
versions. Both clients have a golden fingerprint regression fixture.

Deployment checklist: test all adapters; dry-run Wrangler; confirm the existing
installation has only the intended repository access; deploy the additive
migration; enable MKV intake; use synthetic reports to verify new/duplicate/new-ID
aggregation and reopen behavior; close only the synthetic test issue. Record the
source SHA, deployed Worker version, test counts, and receipts. An existing health
response does not prove MKV GitHub issue delivery.

## Podcast Visualizer adapter

Production acceptance on 2026-09-07: commit `59da9c9` is deployed as Worker
version `2d3f01e9-ff9e-4a22-a034-399f2dda3e8f`. The existing GitHub App has
Issues access to both repositories. Synthetic Podcast issue #29 verified
creation, deduplication, aggregation, and reopening; the native Swift client
also verified duplicate receipts. JSON key ordering is covered by a regression
test. All synthetic issues are closed.

The dedicated Cloudflare token was rolled with its existing permissions and
the Actions `CLOUDFLARE_API_TOKEN` secret refreshed. Hosted
[deploy run `34081481478`](https://github.com/aindaco1/ascii-vj-remix/actions/runs/34081481478)
passed all 22 relay tests and deployed successfully. This resolves the invalid
authorization format in run `34078858653`, which previously required a local
Wrangler deployment. A live synthetic retry returned HTTP 200 and the existing
issue #29 receipt; its count stayed at 3 and it remained closed. Production
intake is enabled and operational.

The same Worker has a separate route, enabled in production configuration:
`POST /v1/podcast-visualizer/reports`. It validates the strict
`podcast-visualizer-issue-report-v1` metadata schema in `src/podcast.js` and
routes only to `aindaco1/podcast-visualizer`, reusing GitHub authentication and
issue formatting. It accepts no arbitrary messages, stacks, paths, or log files.
The existing ASCII endpoint and client contract remain unchanged.

Podcast fingerprints include command, safe error/cause/reason, phase,
architecture, process result, and actual codec/background. Progress, aspect,
report ID, and workflow app version do not fragment a matching issue. Native
crash frame offsets include build/OS because offsets change between binaries.
This is symptom grouping, not automatic root-cause proof.

One SQLite Durable Object per Podcast fingerprint serializes external provider
calls. Counts persist before delivery; the latest 1,000 receipts deduplicate
retries, with 100 pending IDs and 32 version/platform buckets per group.
Provider failures are not acknowledged as success. Matching new reports update
or reopen the indexed issue without adding comments. After an uncertain create,
retry searches the exact fingerprint marker (including closed issues) and does
not issue a second POST until the result is reconciled. If GitHub never created
that issue, an operator must inspect and clear the group's `creation:` intent;
do not clear it before checking for an existing issue.

Before enabling, grant the GitHub App installation Issues read/write access to
the Podcast repository, test and deploy the migration in `wrangler.jsonc`, and
set `PODCAST_REPORTS_ENABLED=true`. The app separately requires the production
bundle ID, release build, and `PVSupportReportsEnabled=true`. Run a synthetic
submission/duplicate acceptance only with authorization to create the test
issue. No private user report should be used for deployment verification.

Validation: `npm run test:crash-relay` from the repository root and
`npm --workspace crash-relay run deploy:dry-run`. The deploy workflow uses the
root workspace lockfile. Local tests and dry-run bundling do not establish a
deployed route or GitHub App installation access.

Cloudflare Worker intake for production crash reports from ASCII VJ Remix.

The desktop app never contains GitHub credentials. The Worker receives bounded,
sanitized reports, rate-limits requests, aggregates matching fingerprints, and
creates or updates GitHub issues through a GitHub App installation token.
Renderer reports may include at most eight sanitized structured events with
preset/backend state; the relay never accepts media or arbitrary client logs.
Best-effort local media-diagnostics writer failures are ignored as non-fatal so
older Windows clients cannot turn a missing log path into a GitHub crash issue.
Expected unavailable or disconnected microphone hardware is also ignored so a
Linux VM without microphone passthrough does not become a crash issue.

## Setup

Use a Cloudflare API token with Workers deploy access and Workers KV edit access.
Store only the token value in the Actions `CLOUDFLARE_API_TOKEN` secret, without
an `Authorization` header, `Bearer` prefix, quotes, or a copied curl command.
The Pool token can list namespaces, but it currently cannot create the crash
relay KV namespaces.

`wrangler.jsonc` contains dedicated production and preview KV bindings for rate
limits and crash-fingerprint indexing. To provision replacement namespaces, use:

```bash
wrangler kv namespace create ASCII_VJ_CRASH_RATELIMIT
wrangler kv namespace create ASCII_VJ_CRASH_RATELIMIT --preview
wrangler kv namespace create ASCII_VJ_CRASH_INDEX
wrangler kv namespace create ASCII_VJ_CRASH_INDEX --preview
```

Update the `RATELIMIT` and `CRASH_INDEX` bindings in `wrangler.jsonc` only when
replacing those namespaces.

The KV ids and `crash.dustwave.xyz` custom domain are configured. The GitHub
Actions deploy workflow remains manual-only.

Set secrets:

```bash
wrangler secret put GITHUB_APP_ID
wrangler secret put GITHUB_APP_INSTALLATION_ID
openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt \
  -in github-app-private-key.pem \
  -out github-app-private-key.pkcs8.pem
wrangler secret put GITHUB_APP_PRIVATE_KEY < github-app-private-key.pkcs8.pem
```

`GITHUB_APP_PRIVATE_KEY` must be PKCS#8. GitHub may download new app keys in
PKCS#1 form, which is why the conversion step is explicit.

Deploy:

```bash
npm install
npm run check
npm run deploy
```

The production endpoint is:

```text
POST https://crash.dustwave.xyz/v1/reports
```

## Aggregation

Reports are not appended indefinitely. The relay keeps one open GitHub issue per
stable fingerprint and rewrites that issue with bounded aggregate state.

The fingerprint uses:

- kind and surface
- OS/architecture platform
- command/backend/source/media/native-output dimensions when present
- `errorCode`, `code`, `statusCode`, `status`, `errorKind`, or `name` when present
- normalized top stack frame when no stable error code exists
- normalized message only as the final fallback

That means reports with the same platform and stable error code aggregate even
when the exact message or stack line changes. Reports with different stable
error codes create separate issues.
