# Deployment verification and release gates

Local verification first run **October 17, 2026**, re-run in full on **October 18, 2026 (America/New_York)**
after the GHT pilot remediation. Repository remote is `https://github.com/Kienda/Operix.git`, local HEAD
`08684c5`; implementation is an uncommitted local change. Pilot-level evidence and the readiness verdict are in
[docs/pilot/TEST_EVIDENCE.md](../docs/pilot/TEST_EVIDENCE.md) and
[docs/pilot/READINESS_REPORT.md](../docs/pilot/READINESS_REPORT.md).
No commit, push, GitHub setting, AWS resource, DNS or live host configuration was changed.

## Investigation

Read `AGENT.md`, the September 30 system audit and its October 2 update, manifests/lockfiles/workspace/Turbo/
TypeScript/Vitest/Playwright configuration, current Vite entry switch, API startup/config/authz/workflow paths,
Prisma schema and five migrations, worker queue handling, SMTP implementation, seed and pilot bootstrap,
existing development Compose and deployment/testing guides. Production ships `src/pilot`, not the earlier
marketing/mock-data prototype. Keep `VITE_OPERIX_EXPERIENCE=pilot`; same-origin `/api/v1` matches the new gateway.

The active API uses `platform/config.ts`, not the larger planned `@operix/config` schema. Settings in the old
`.env.example` are not evidence of runtime support. Only the settings consumed by the current API/worker are
injected. Readiness is `/api/v1/health` (database query); `/api/v1/health/live` is process liveness. Request JSON
logging and exception sanitization are implemented, but CloudWatch collection is not installed by this work.

## Results (October 18)

| Check | Result |
| --- | --- |
| Frontend `npm run check:i18n` | PASS, 347 English/French keys |
| Frontend `npm run build` | PASS, staff-pilot production bundle |
| Backend `pnpm test --force` | PASS, 95 tests: 44 permissions, 51 API unit tests; some packages have no tests |
| Backend `pnpm typecheck --force` | PASS across workspace |
| Backend `pnpm build --force` | PASS, all seven packages |
| `pnpm test:e2e` (`test:p0`) | PASS, 25 P0 HTTP/PostgreSQL regressions + 2 migration rehearsals |
| `pnpm --filter @operix/api test:pilot` | PASS, 31 API/SMTP/pilot cases |
| `pnpm --filter @operix/api test:qa` | PASS, 10 suites: 126 pass, 22 `it.fails` documented known gaps (none in an enabled pilot workflow) |
| `npm run test:browser` | PASS, 9/9 Playwright walkthrough steps, no console errors or failed requests |
| `pnpm lint` | 0 tasks; not lint coverage (open item) |
| `pnpm format:check` | PASS |
| Frontend npm registry audit | PASS, 0 advisories |
| Backend pnpm registry audit | PASS, 0 advisories (patch-level pins, same majors) |
| Deployment contract tests | PASS, 5: Compose isolation/resources, secret scoping, placeholder/reuse rejection, credential-rotation fingerprint, SSM/IAM scope |
| Actionlint 1.7.7 | PASS for both workflows |
| ShellCheck 0.10.0 `-S warning` (as CI) | PASS for all deploy and docker scripts, including the new backup and restore-rehearsal scripts |
| Four Linux Docker image targets | PASS: API, worker, migration on distroless Node 24 (Debian 13); web on nginx 1.30 Alpine |
| Actual Compose image smoke | PASS: all five migrations, privilege hardening, health/readiness, SPA deep link, same-origin API, nonprivileged application role, append-only audit log, security headers, zero seeded users/organizations, production bootstrap dry run, worker disabled |
| CloudFormation `cfn-lint` and Compose YAML parsing | PASS locally (Oct 17); no CloudFormation API call or stack deployment |
| Trivy 0.61.1 read-only archive image scans | PASS: 0 HIGH / 0 CRITICAL on all four images |
| Live AWS, ECR push, SSM execution, TLS/DNS, Nginx, staff acceptance | NOT RUN; requires approval and missing account/instance/proxy/provider configuration |

Initial sandbox cache permissions blocked backend test writes; the authorized local rerun passed. Test
services were created under `operix-deploy-tests` on loopback ports 55439/11025/18025; no Tontin or existing
Operix container/data was used for fixtures. The P0 harness was corrected to use `P0_TEST_DATABASE_URL` for
its administrative client too, and to support a clean checkout without a development `.env` file.

October 17 failures and how they were resolved (no access expectation was weakened):

- **QA suite** failed in shared fixture setup (customer schema rejected a fixture field). Fixtures were
  and the harness were updated to the current API contracts (typed record schemas, command-only
  quotations); all 10 suites now run. Intended-but-missing behaviour is kept as
  `it.fails('KNOWN GAP …')`, which turns red when implemented.
- **Browser suite** failed at a test helper. Fixed; the full 9-step walkthrough passes.
- **Registry advisories** (backend 4 critical / 18 high / 12 moderate / 1 low, e.g. `proxy-addr`, `multer`,
  `fast-uri`, `js-yaml`, `vitest`): focused patch-level pins within the same majors; no audit suppression.
- **Formatting**: repository reformatted with the project's Prettier config.
- **Image scans** (Oct 17: API 71/5, worker 67/4, migrate 110/10, web 65/3 high/critical package findings):
  most were Debian 12 OS packages with no fix and the npm bundled in the Node base image. Runtime stages now
  use `gcr.io/distroless/nodejs24-debian13:nonroot` (no shell, package manager or OS utilities; Prisma and
  OpenSSL 3 verified by the smoke test) and `nginxinc/nginx-unprivileged:1.30-alpine` (the 1.28 line is no
  longer patched upstream) with `apk upgrade --available` at build. Result: 0/0 on all four images.

Base tags still move. CI rescans every build; pin the resolved digests for each promoted release.
Docker smoke testing exposed and corrected Compose tmpfs list quoting and gateway ingress networking;
the final successful run used a separate ordinary gateway bridge with loopback-only port publishing.
Its disposable containers/networks/volumes were removed after assertions. The earlier static config check
alone would not have caught the actual host-port issue.

## September 30 critical findings review

| Audit concern | Present evidence | Access decision |
| --- | --- | --- |
| Tenant/branch/assigned/self scope, denies/module ceilings, employee data, recipient visibility | Central authorization policy/scoped queries, composite constraints; P0 and pilot allowed/denied cases pass | Keep pilot-only module ceiling; full QA setup must be repaired and retested |
| Financial precision/currency/allocations/concurrent posting | Decimal validation, serializable whole-command retries/idempotency; P0 concurrent verification and migration ledger-preservation tests pass | Finance remains disabled for this staging pilot; reconcile real data and complete workflow acceptance before expanding |
| Inventory negative receipts/concurrency/ledger drift | Positive movement rules, request UUID, serializable posting and reconciliation checks; P0 stock tests pass | Inventory remains disabled; transfers/reservations and full operational acceptance are unfinished |
| Generic PATCH workflow/contract/archive bypass | Protected transitions and dedicated commands; P0 regressions and pilot quotation/project flow pass | Only the tested pilot modules may be enabled; not a completion claim for broader commercial workflows |
| MFA replacement, missing production secrets, recovery/invites | Pending enrollment proof/session/expiry, startup config validation, SMTP, pilot MFA/reset/invite tests pass | Live SMTP/TLS/MFA onboarding and independent security acceptance still required |
| Worker/email/export false success | Direct SMTP service exists; worker notification/export/render handlers remain placeholders | Worker disabled; no staff promise of queued notifications, PDFs or report delivery |
| Deployment and recovery | Local artifacts and guarded scripts provided | No staff access until isolated staging, backup restore, monitoring, capacity, routing and approval gates pass |

This uses the audit's October 2 superseding evidence where appropriate. Passing P0 tests is a regression
baseline, not a declaration that the September 30 feature matrix or all release gates are complete.

## Required promotion evidence

Resolve package/image advisories and test failures; implement meaningful lint coverage; enforce protected
main/environment approval on the private repository; approve/rehearse the CloudFormation/IAM and host
bootstrap; inspect Tontin headroom and proxy isolation; confirm private ports from outside the instance;
verify TLS/allowlists and real SMTP/reset/invite/MFA flows; test branch/role denial on the deployed pilot;
perform database backup upload/download/restore into a separate database with reconciliation; test application
rollback and a failed schema change; install/trigger monitoring alarms and agree retention/recovery ownership.
Record tester signoff before allowing authoritative business data. There is no automatic production job.
