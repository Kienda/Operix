# Deployment verification and release gates

Local verification on **October 17, 2026 (America/New_York)**. Repository remote is
`https://github.com/Kienda/Operix.git`, local HEAD `04448b9`; implementation is an uncommitted local change.
The existing browser test file and generated browser artifacts were already modified on entry. They have
not been reset or represented as part of the deployment implementation. Running browser tests regenerated
their normal reports. No commit, push, GitHub setting, AWS resource, DNS or live host configuration was changed.

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

## Results

| Check | Result |
| --- | --- |
| Frontend `npm run check:i18n` | PASS, 347 English/French keys |
| Frontend `npm run build` | PASS, staff-pilot production bundle |
| Backend `pnpm test --force` | PASS, 95 tests: 44 permissions, 51 API unit tests; some packages have no tests |
| Backend `pnpm typecheck --force` | PASS across workspace |
| Backend `pnpm build --force` | PASS, all seven packages |
| `pnpm test:e2e` | PASS, 25 P0 HTTP/PostgreSQL regressions + 2 migration rehearsals |
| `pnpm --filter @operix/api test:pilot` | PASS, 31 API/SMTP/pilot cases |
| `pnpm --filter @operix/api test:qa` | FAIL: 10 suites fail in shared fixture setup, 148 tests skipped |
| `npm run test:browser` | FAIL: 4 pass, 1 fails (`nav is not a function`), 4 do not run |
| `pnpm lint` | 0 tasks; not lint coverage |
| `pnpm format:check` | FAIL, broad existing formatting differences; no unrelated mass reformat |
| Frontend npm registry audit | PASS, 0 advisories at verification time |
| Backend pnpm registry audit | FAIL, 4 critical / 18 high / 12 moderate / 1 low |
| Deployment contract tests | PASS, 5: Compose isolation/resources, secret scoping, placeholder/reuse rejection, credential-rotation fingerprint, SSM/IAM scope |
| Actionlint 1.7.7 | PASS for the new workflow |
| ShellCheck 0.10.0 and Linux Bash syntax | PASS after fixing export/assignment warning |
| Four Linux Docker image targets | PASS: API, worker, migration, web; Linux Prisma client resolution checked during build |
| Actual Compose image smoke | PASS: all five migrations, health/readiness, SPA deep link, same-origin API, nonprivileged application role, zero seeded users/organizations, worker disabled |
| CloudFormation `cfn-lint` and Compose YAML parsing | PASS locally; no CloudFormation API call or stack deployment |
| Trivy read-only archive image scans | FAIL release thresholds for all four images; counts below |
| Live AWS, ECR push, SSM execution, TLS/DNS, Nginx, staff acceptance | NOT RUN; requires approval and missing account/instance/proxy/provider configuration |

Initial sandbox cache permissions blocked backend test writes; the authorized local rerun passed. Test
services were created under `operix-deploy-tests` on loopback ports 55439/11025/18025; no Tontin or existing
Operix container/data was used for fixtures. The P0 harness was corrected to use `P0_TEST_DATABASE_URL` for
its administrative client too, and to support a clean checkout without a development `.env` file.

The broader QA fixture sends `projectManagerUserId` to the current customers schema, which rejects it with
HTTP 400. This is not evidence that the 148 intended cases pass. The browser suite fails at a test-helper
invocation, not a successfully completed walkthrough. Resolve these test/contract mismatches and rerun
without weakening access expectations before permitting staff access. They are left visible as CI failures.

Critical advisories include production `proxy-addr` IP spoofing and development `vitest`/`tinypool` issues;
high advisories include `multer`, `fast-uri`, `js-yaml` and other transitive dependencies. Do a focused,
compatibility-reviewed lockfile update and rerun all gates; no blanket major dependency upgrade or audit
suppression was performed. CI blocks publication on high/critical registry or image findings.

Image scans used Trivy 0.61.1 with a newly downloaded vulnerability database, scanning read-only `docker save`
archives without mounting the Docker socket. High/critical **package findings** (not deduplicated CVE totals):

| Image | High | Critical |
| --- | ---: | ---: |
| API | 71 | 5 |
| Worker (disabled) | 67 | 4 |
| Migration tooling | 110 | 10 |
| Web | 65 | 3 |

These include OS/base-image packages as well as application/tool dependencies. Review fixed versions,
refresh/pin patched base images and lockfiles, and rerun scans; successful build/startup does not waive
vulnerability gates. Local reports remain under ignored `tmp/deployment-*-audit.*` for inspection.
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
