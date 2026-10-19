# Test evidence — GHT pilot

Run on **2026-10-18** on the final working tree (local Windows 11 workstation, Docker Desktop,
PostgreSQL 16, Redis 7, Mailpit for SMTP). Nothing here was run against AWS or real staff data.
Every gate below except actionlint is also a step in `.github/workflows/operix.yml`.

## Summary

| Gate | Command | Result |
| --- | --- | --- |
| Frontend build (staff pilot) | `npm run build` | PASS |
| Frontend translations | `npm run check:i18n` | PASS — 347 keys, English = French |
| Backend typecheck | `pnpm typecheck --force` | PASS — all packages |
| Backend formatting | `pnpm format:check` | PASS |
| Backend lint | `pnpm lint` | **No coverage** — 0 lint tasks configured |
| Unit tests | `pnpm test --force` | PASS — 95 (44 permissions, 51 API) |
| Audit P0 regressions | `pnpm --filter @operix/api test:p0` | PASS — 27/27 (25 HTTP+PostgreSQL, 2 migration rehearsals) |
| Pilot API integration | `vitest run --config vitest.pilot.config.ts` | PASS — 31/31 (real HTTP, PostgreSQL, SMTP) |
| Broad QA suite | `pnpm --filter @operix/api test:qa` | PASS — 126 pass; 22 documented known gaps (below) |
| Browser walkthrough | `npm run test:browser` (Playwright, Chromium) | PASS — 9/9, no console errors or failed requests |
| Dependency advisories | `npm audit`, `pnpm audit` | PASS — 0 known in both trees |
| Linux images | 4 targets: api, worker, migrate, web | PASS — build |
| Image vulnerability scan | Trivy 0.61.1, HIGH/CRITICAL, read-only archives | PASS — **0 / 0** on all four images |
| Compose smoke test | `python deploy/tests/smoke.py` | PASS — see below |
| Deployment contract tests | `python -m unittest deploy/tests/test_deployment.py` | PASS — 5/5 |
| Workflow lint | actionlint 1.7.7 | PASS |

## Representative USA and Guinea accounts (pilot API suite)

The suite bootstraps the real organization (GHT, branches US and GN), invites staff by email,
activates them through the emailed links (Mailpit), and then acts as each of them:

| Account | Role | Branch | Proves |
| --- | --- | --- | --- |
| owner | Owner | all | MFA required before business access; only owners mint owners |
| admin | Administrator | USA | MFA required; delegation ceiling; invites only inside own branch |
| finance | Finance | all | Read-only; sees customer financial fields and budgets |
| pmUS / pmGN | Project Manager | USA / Guinea | Each sees only own-branch projects; budget visible |
| salesMgrGN | Sales Manager | Guinea | Records quotation decisions |
| salesGN / salesGN2 | Sales Representative | Guinea | Own customers/quotations only; cannot see each other's; financial fields hidden |
| productionGN | Production | Guinea | Plans tasks inside Guinea projects |
| employeeUS / employeeGN | Employee | USA / Guinea | See and progress only their own task (status only) |
| another tenant | Owner of a second organization | — | Denied with a valid session |

### Allowed and denied scenarios covered

Organization & access — dry run writes nothing · one org with USA/Guinea, pilot roles, pilot-only
modules · idempotent, single owner invitation · MFA gate · invitations emailed without exposing the
link or token hash · reused/revoked/expired/replaced invitations rejected · existing account must
prove its password · delegation ceiling · cannot move members outside own scope or promote to owner
· suspension revokes access immediately, reactivation restores it.

Records — numbers server-assigned, scope derived, fields validated · branch and assignment isolation
on list, detail and search · customer financial fields hidden from roles without permission ·
GNF/USD totals at currency precision · client totals, bad precision and generic writes rejected ·
who may send and record decisions · expired quotation cannot be accepted · project created from an
accepted quotation in its branch · budget visibility · status only through audited commands · tasks
only for eligible staff in the branch · employee sees only own task · project completion.

Security — finance, inventory, HR, attendance and other modules unreachable · other tenant denied ·
sign-in rate limiting per identity · refresh-token rotation once under concurrency · single-use
emailed password reset that revokes old sessions · logout revokes the session · liveness/readiness
and sanitized errors.

## Browser walkthrough (`e2e/pilot.spec.mjs`)

1. Owner activates from the emailed link and must enroll MFA before using Operix.
2. Owner invites Guinea staff through Team (email only, no links shown).
3. Guinea sales rep creates a customer and a GNF quotation with server-computed totals.
4. Owner records acceptance, opens the project from the quotation and assigns a task.
5. Employee activates and sees only their own task, which they can progress.
6. Sales rep cannot reach team management or other people's records.
7. Dialogs trap focus and close with Escape; French is available.
8. Phone layout: navigation drawer and readable task cards.
9. No script errors or failed requests during the walkthrough.

Screenshots: [`e2e/evidence/`](../../e2e/evidence/) (01 owner dashboard … 10 mobile task cards).

## Compose smoke test (production images)

Real Linux images under the production Compose file: private database network, all five migrations,
post-migration privilege hardening (API role cannot alter the audit log or migration history), SPA
deep links and same-origin API routing, readiness, **zero seeded users or organizations**, security
headers (CSP, HSTS, frame, content-type, permissions policy) on HTML and assets, and a production
bootstrap dry run under the least-privilege role.

## Known gaps (22 `it.fails` tests in the QA suite)

These encode intended behaviour that does not exist yet; they flip to failures when implemented.
None is in an enabled pilot workflow except the first two, which are deliberate pilot decisions.

| Area | Gap | Pilot impact |
| --- | --- | --- |
| Projects | Employee members cannot see the project they work on | Decision D3 (restricted by design) |
| Workflows | Generic catalog roles (`project_manager`, `sales_representative`) cannot cross-reference unassigned records | Not used: pilot roles are branch-scoped (D5) |
| Leads, contracts, milestones | No conversion/execution commands or milestone model | Not enabled |
| Finance | No invoice/payment read endpoints, no receipts | Module disabled |
| Inventory, procurement | No stock card, no approval/receiving commands | Module disabled |
| Expenses | No approval command | Module disabled |
| Attendance / guards | ATT-01 double check-out, no site/shift model, no checkpoint scans | Module disabled |
| Customer portal | Not implemented | Module disabled |

## Not yet tested (requires approved infrastructure)

Live AWS release via SSM, ECR publication, TLS and DNS, host Nginx coexistence with Tontin, real SMTP
provider deliverability, S3 backup upload and restore rehearsal on the host, monitoring alarms,
load/capacity on the shared instance, and acceptance by real GHT testers on the deployed pilot.
