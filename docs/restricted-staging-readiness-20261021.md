> Current instruction: retain approved PROXY_MODE=tunnel. No loopback configuration change is approved. See [final publication approval review](publication-approval-review-20261021.md) for current merge/CI state and the pending publication approval.

> Historical preparation snapshot. The newer [read-only live verification](read-only-release-verification-20261021.md) supersedes its access, ECR/IAM, CI, and old-source blockers.

# Restricted staging preparation — October 21, 2026

Status: HOLD. This is a review artifact, not deployment or infrastructure approval.
Tontin maintenance is tracked separately in its own repository. Do not install its
backup script, restart it, modify its database, or change its containers, ports,
networks, volumes, proxy or DNS as part of this release.

Reviewed Operix HEAD: 358512ebedc49ba777051c7cd223713b645ce18c.
The local working tree contained untracked AWS proposal files and
`docs/ecr-publishing-review.md`; these are not approved deployed-state evidence.

## Candidate remediation evidence

Fresh local Trivy 0.61.1 scans, using the pinned scanner and unchanged
HIGH,CRITICAL / exit-code 1 gate, pass for both internal amd64 candidates.
The scan database was freshly downloaded. Alpine 3.24 EOL-list and vendor-severity
coverage warnings remain; clean means no findings at the configured threshold.

Local candidate index identities (not published ECR release digests):

- PostgreSQL: sha256:536950f13a8c88918f31efa5a8d081f68f26e6b12c7a3c690ef247cd980e6d7b
- Redis: sha256:4cec9322a7cbf122840910e9e2f4f7a62a5d818f0cc0d620cea8cd26ee0a8caf

The real local synthetic compatibility suite passes Bookworm logical dump to
candidate restore, Unicode/decimal fixtures, candidate dump/restore, PostgreSQL
restart persistence, Redis same-volume compatibility, authentication/AOF/restart,
and verified cleanup. No existing volumes were attached and no application
migrations ran in that compatibility suite. Historical arm64 candidate scan
summaries are clean; they were not freshly rerun in this review.

## Release identity blockers

The local `tmp/phase3c-validation-f28d22e/release.json` identifies
f28d22e051e9b94fa862d29ea1b0ab967e4fce1b-39533688523-1, not reviewed HEAD.
It contains only commit and release, with no immutable image digest inventory.
The current workflow likewise packages only these two fields, and the receiver
strictly expects exactly those fields. Existing local application image labels
do not establish their identity as artifacts built from reviewed HEAD.

Before approval, a reviewed code change must make the publisher and receiver agree
on an authenticated, checksum-bound release inventory containing all seven image
references and immutable published ECR digests, source commit, release identity,
and migration checksum. Resolve each digest from the registry after publication,
verify it belongs to the exact release, and deploy those digest references.
Do not substitute local image IDs or provenance index IDs for ECR digests. Do not
add manifest fields without updating the strict receiver and its tamper tests.

No approved current release manifest or AWS credentials were available in this
session. AWS `sts get-caller-identity` returned NoCredentials. Obtain the approved
read-only profile and release evidence; do not infer approval from an old manifest,
proposal file, green historical run, mutable tag, or disabled deployment switch.

## Approval packages and remaining gates

1. Review the exact deployed CloudFormation baseline. Separately approve only the
   proposed immutable/encrypted/scanned ECR repositories `operix-postgres` and
   `operix-redis`, plus narrow repository-specific publisher and instance pull IAM.
   Do not apply AWS proposals automatically or broaden existing roles.
2. Review code adoption of the supporting candidates in release Compose and
   publication/manifest handling. Update the recovery image and UID/GID handling
   consistently: existing restore-common.sh uses UID/GID 999; Alpine PostgreSQL
   requires 70. Never attach existing Bookworm database files to Alpine. Verify
   first staging has no Operix data; use a fresh Operix-only volume. Any logical
   migration of existing data needs its own approval and retained source volumes.
3. Require the latest exact-head CI to pass all security, application/migration,
   recovery and candidate integration gates. The candidate application smoke is
   intentionally CI-only; do not fake CI=true on a workstation to bypass that
   execution boundary. Main-only publication remains intact. Merge and publishing
   need separate authorization; do not push just to manufacture release evidence.
4. Verify the published seven-image digest inventory, bundle SHA-256, migration
   checksum and approval-protected release identity after approved publication.
5. Perform read-only host inspection: Tontin resource baseline; free disk/memory,
   CPU credits and load; Operix-only resource names and available loopback port
   18080; credential scoping, IMDS blocking, backup/restore receipt and cleanup;
   deployment approval controls and rollback compatibility. Existing documented
   minimums are 2 GiB available memory and 10 GiB free disk, not proof of headroom.
6. Preserve current DNS and Tontin proxy configuration. The existing deploy script
   starts the tunnel after health checks in tunnel mode, so tunnel activation and
   tester-only Access acceptance must be explicitly included in any approval.
   For a first approval excluding route activation, use and verify the existing
   `PROXY_MODE=host` branch as a loopback-only health rehearsal, without installing
   or reloading any host proxy configuration. This branch leaves the tunnel out
   of the deployment command; gateway port 18080 remains bound to 127.0.0.1.
   Restrict access to an approved SSM port-forward session. Verify host bootstrap
   has no proxy side effects before approval; do not silently run tunnel mode. No DNS,
   proxy, network or firewall change is authorized by this preparation document.
7. Restrict initial staging to synthetic data while the documented unencrypted EBS
   condition remains. Confirm live encryption state and access restrictions before
   approval. EBS migration and Tontin backup installation are separate workstreams.

The final staging approval request must name the exact release and seven digests,
list allowed host changes, keep the worker disabled, state synthetic-data-only and
approved testers, include resource/health/backup acceptance and rollback criteria,
and attach exact-head test evidence. The release currently cannot meet that bar.

## Local test checkpoint

Backend workspace type checks/build and unit tests pass. P0 tests: 27/27. Pilot:
31/31. All 29 deployment contracts pass in a disposable Linux container with
read-only source and tmpfs fixtures, no host Docker socket. Bash syntax and
ShellCheck pass. Frontend audit reports zero findings; backend reports two moderate
findings and passes the HIGH threshold. The restricted-network audit attempts
failed; the permitted local rerun with TLS verification enabled supplied these
results. Completed QA/browser/formatting and application image results follow below;
do not interpret this local checkpoint as full CI acceptance.

No AWS write, SSH, deployment, cron edit, DNS change, service restart or production
database operation was performed. Local synthetic test containers and scratch
volumes are the only services created by this review.

### Completed local application checks

| Check | October 21 result |
| --- | --- |
| Backend build | 7 tasks passed |
| Backend type checks | 11 tasks passed |
| Backend unit tests | 10 tasks passed; API 95/95, other workspace tests also passed |
| P0/migration regression suite | 27/27 passed |
| Pilot API/SMTP suite | 31/31 passed |
| Authorization/workflow QA | 152/152 passed across 11 files; no expected-failure/skip markers found in QA sources |
| Frontend translation check | 347 keys passed |
| Frontend locked production build | passed on Vite 8.2.4 |
| Locked frontend browser walkthrough | 9/9 passed |
| Backend lint | 7 tasks passed |
| Backend formatting | passed |
| Deployment contracts/recovery faults | 29/29 passed in Linux |
| Shell syntax / ShellCheck | passed |
| Candidate real persistence/restore compatibility | passed, scratch cleanup verified |

The initial frontend run exposed stale node_modules with Vite 8.2.0 despite the
manifest/lockfile requiring 8.2.4. `npm ci` corrected the local install without
changing the manifest or lockfile. Audit, build, translations and all nine browser
tests were then rerun successfully. Production build emits lucide-react module
level `use client` directive warnings; browser acceptance passed. Both uniquely
named local PostgreSQL/Mailpit test stacks were removed after testing. Tracked
browser screenshots/reports/state were restored to their original contents;
no application or deployment source files were changed by this preparation.

The earlier Windows recovery runner failed due to shell/path assumptions. The
unmodified full suite passed in the Linux runner with a read-only repository,
tmpfs fixtures, and Compose CLI for syntax rendering; no host Docker socket was
exposed to that runner. This is local evidence, not a fresh GitHub exact-head run.

### Fresh configured-image gate and stale artifact finding

The actual configured PostgreSQL/Redis scan was rerun and exited 1. PostgreSQL
resolved to `postgres:16-bookworm@sha256:d81f7b51697014367236d07ec58b54153fc28f828b72bf247fe5c7487520bcb0`:
its OS report has 71 HIGH/3 CRITICAL and gosu has 25 HIGH/1 CRITICAL (96 HIGH,
4 CRITICAL report entries total, not deduplicated advisories). Redis resolved to
`redis:7.4-alpine@sha256:858f009f9709ce576febc734aa78b8f6d624b82571f9ddb6bda4377c833b3499`
and has two HIGH entries for CVE-2026-84782 in libcrypto3/libssl3 3.3.7-r1;
3.3.7-r2 is the reported fix. No scan suppression or ignore-unfixed option was used.

Fresh scans of existing local API, worker, web and tunnel `:test` images pass.
The existing migration `:test` image fails on HIGH CVE-2026-112942: it contains
Vite 8.2.0 while reviewed source/locks require patched Vite 8.2.4. Do not deploy
that stale image or relabel it as a new release. The migration image was rebuilt from reviewed HEAD as
`local/operix-migrate:readiness-358512e` and passed a fresh scan with exit 0 and
zero HIGH/CRITICAL findings. Its local index digest is
`sha256:5f11242ffbe71051cedfcc0166459774616f0749f09665aa09228fb44741a362`,
and the revision label matches reviewed HEAD. This remedies the stale local
artifact; the old `:test` migration image remains rejected.
None of these local artifacts are published or approved release images.

Raw scan logs are retained at:

- `%TEMP%/operix-configured-support-scan-20261021.log`
- `%TEMP%/operix-release-scans-c05a81441fc64110b479f69564e87899/`
- `%TEMP%/operix-migrate-readiness-build.log`
- `%TEMP%/operix-migrate-readiness-scan/scan.log` (after the rebuild scan completes)


## Proposed first staging scope for separate approval

After all blocking image/release/host gates are resolved, propose only the exact
reviewed release on `operix-staging`, synthetic fresh Operix-only data, worker
disabled, existing `PROXY_MODE=host` deployment branch, and loopback port 18080.
Do not install a host Nginx configuration, edit Tontin's proxy, start cloudflared,
or change DNS. The operator must explicitly approve the staging environment file,
approval sentinel, Operix-only containers/networks/volumes and scoped IMDS firewall
rules before execution. The current deploy script itself must not be invoked as
a mere readiness check because it makes those host changes.

Use a separately approved SSM port-forward to inspect health/readiness and the
synthetic zero-account deployment; record the container image digest inventory,
resource limits and backup/restore evidence. This first scope does not certify
public HTTPS, email invitation links using the public APP_URL, Cloudflare Access,
or staff acceptance. Those require a later explicit route/access approval. Keep
the deployment enable switch disabled until the exact first-scope approval is
recorded, and inspect host bootstrap to confirm it has no proxy/DNS side effects.

The two moderate backend audit entries are in development dependency
`@vitest/mocker` (manual mock registration code injection and Windows backslash
redirect allowlist traversal). They do not exceed the existing HIGH gate; retain
them in the risk review rather than claiming zero backend vulnerabilities.


## Final disposition

HOLD deployment. Application checks, all 29 deployment contracts, shell checks,
network-isolated tunnel tests, both fresh supporting-candidate scans and their
real compatibility/restore suite pass. Four existing application image scans pass;
the rebuilt migration image also passes. The configured supporting-image gate
still exits 1. No approved current published seven-image digest inventory or
fresh exact-head CI/CI-only candidate application integration evidence was verified.

Outstanding: approved read-only AWS/release access; live baseline/headroom/backup
and encryption checks; narrowly approved ECR/IAM publication; reviewed candidate
adoption and recovery UID/GID changes; publisher/receiver digest inventory changes;
exact-head full CI; published immutable digest/bundle verification; explicit
first-staging approval and permitted access scope. Public route/Access acceptance
is deferred under the proposed loopback-only first stage. Tontin ownership/cron
verification and backup installation approval remain completely separate.

No production or remote infrastructure was changed. Only this readiness document,
local installed dependencies/build artifacts, a new local migration image and
isolated test artifacts were produced in Operix. Pre-existing untracked proposals
were preserved. The two temporary integration/browser Compose projects are absent.
