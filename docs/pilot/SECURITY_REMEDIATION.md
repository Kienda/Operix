# Security remediation report — GHT pilot

Date: 2026-10-18. Baseline: [system audit](../OPERIX_SYSTEM_AUDIT.md) (2026-09-30, P0 update 2026-10-02).
Evidence for every "Fixed" row is an automated test listed in [TEST_EVIDENCE.md](TEST_EVIDENCE.md).

## 1. Audit P0 findings — revalidated against the current repository

All ten P0 regressions were re-run against the code as changed in this pass (real HTTP stack,
PostgreSQL, concurrency where relevant): **27/27 pass** (`pnpm --filter @operix/api test:p0`).

| ID | Finding | Status now | Pilot exposure |
| --- | --- | --- | --- |
| AUTHZ-01 | Branch/assignment scope bypass | Fixed, re-verified; extended to new endpoints (quotations, project commands, directory, users) | In scope — pilot suite adds USA/Guinea cases |
| AUTHZ-02 | Overrides / disabled modules ignored | Fixed, re-verified; plus deployment module ceiling | In scope — finance cannot be re-enabled by a DB flag or override |
| AUTHZ-03 | Sensitive fields / recipients | Fixed, re-verified; extended to customer financial fields and project budgets | In scope |
| AUTHZ-04 | Finance summary on `reports.view` | Fixed, re-verified | Finance module disabled |
| FIN-01 | Invalid allocations / currency | Fixed, re-verified | Finance module disabled |
| FIN-02 | Concurrent payment over-posting | Fixed, re-verified | Finance module disabled |
| INV-01 | Concurrent stock overdraw | Fixed, re-verified | Inventory module disabled |
| FLOW-01 | Generic PATCH bypasses workflow | Fixed, re-verified; quotations made command-only | In scope |
| AUTH-01 | MFA re-enrollment takeover | Fixed, re-verified; MFA now usable from the UI and mandatory for Owner/Admin | In scope |
| DATA-01 | Cross-tenant / invalid references | Fixed, re-verified; child records forced into the parent's branch | In scope |

Finance posting and inventory movements pass their transaction-integrity tests but stay **disabled**:
there is no finance/stock UI, no receipts, reversals, credits or opening-balance reconciliation.

## 2. New findings fixed in this pass

| # | Finding (severity) | Fix | Verified by |
| --- | --- | --- | --- |
| S-01 | Hardcoded JWT fallback secret when unset (critical) | Validated config at boot; production refuses missing/short/placeholder secrets; dev uses a random per-process key | `config.spec.ts` |
| S-02 | No brute-force protection on login/reset/invite/MFA (high) | Per-IP and per-identity fixed-window limits, 429 + `Retry-After` | pilot: rate-limit test |
| S-03 | Reset/invitation links logged in plaintext; no delivery (high) | SMTP delivery; links carry the token in the URL fragment; logs contain category/recipient only; invite link never returned in production | pilot: email tests via Mailpit |
| S-04 | Invitation for an existing email silently attached membership; reset/invite tokens not atomically single-use (high) | Existing account must prove its password; atomic claim; a resend revokes the previous link; one live invitation per email (DB index) | pilot: invitation tests |
| S-05 | Refresh-token rotation race; refresh ignored suspended users (medium) | Compare-and-swap rotation; user + membership must be active | pilot: concurrent refresh |
| S-06 | No way to remove a person's access (high, operational) | Membership suspension with immediate session revocation; reactivate; audited | pilot: suspension test |
| S-07 | Invitation list exposed token hashes (medium) | Explicit safe projection | pilot |
| S-08 | Delegation checked disabled-module permissions; any `users.manage` holder could mint owners (high) | Delegation limited to enabled modules, own scope and branches; owner role only by owners; org allowlist of assignable roles | pilot: delegation ceiling |
| S-09 | Quotation totals writable through the generic record API (high, integrity) | Quotations are command-only; totals computed server-side in decimal with currency precision (GNF whole) | pilot + QA |
| S-10 | Client-chosen record numbers; collisions under concurrency (medium) | Atomic per-tenant `NumberSequence` | pilot |
| S-11 | Arbitrary JSON accepted on pilot records (medium) | Typed field schemas, unknown keys rejected, 32 KB cap, date/email/phone validation | pilot |
| S-12 | Employees could edit any field of their tasks; field checks ran before visibility (medium) | Self scope may change status only; visibility (404) always checked first | pilot + QA |
| S-13 | Swagger exposed in production (low) | Off unless `SWAGGER_ENABLED=true` | config spec |
| S-14 | 500s not logged; no correlation IDs; health always 200 (medium, ops) | JSON request/exception logs with request IDs; `/health` returns 503 when the DB is down; `/health/live` | pilot |
| S-15 | Sign-out blocked by an expired subscription (SUB-01) | Account-security routes exempt from subscription write lock | QA |
| S-16 | Unvalidated organization PATCH could write arbitrary `settings` (medium) | DTO validation; settings not client-writable; timezone/currency validated | role matrix |
| S-17 | No enforced MFA for privileged roles (high) | Organization policy, server enforcement, UI enrollment with locally rendered QR | pilot + browser |
| S-18 | Dev seed could run in production and printed the admin password (high) | Seed refuses in production; password no longer printed; production uses `bootstrap-pilot` (no passwords) | manual review |
| S-19 | Login timing revealed whether an email exists (low) | Constant-work verification against a dummy hash | code review |
| S-20 | Gateway dropped all security headers on HTML/assets; no CSP/HSTS (high) | Shared header snippet re-included per location; strict CSP, HSTS, Permissions-Policy | container header check + browser CSP check |
| S-21 | API role could UPDATE/DELETE the audit log and migration history (medium) | Migration step revokes those privileges after each successful migration | smoke test |
| S-22 | Dependency advisories: backend 4 critical / 18 high / 12 moderate / 1 low; frontend 1 high | Patch-level pins (same majors), Nest 11.2.7, vitest 4.1.11 (dev); **0 known advisories** in both trees | `pnpm audit`, `npm audit` |
| S-23 | Phone-number validation silently disabled by an invalid browser pattern | Corrected pattern; browser console gate catches regressions | browser |
| S-24 | Base images carried 66 HIGH / 3–4 CRITICAL OS and bundled-npm findings per image; nginx 1.28 line no longer patched (high) | API/worker/migrate on distroless Node 24 (Debian 13, non-root, no shell or package manager); web on nginx 1.30 with Alpine updates applied at build | Trivy: **0 HIGH / 0 CRITICAL** on all four images; smoke test |

## 3. Residual risks (accepted for a restricted pilot, with mitigations)

| Risk | Mitigation now | Recommended next |
| --- | --- | --- |
| Access/refresh tokens in `localStorage` (stolen by an XSS) | Strict CSP (no inline script), React escaping, no HTML rendering of user content | Move the refresh token to an `HttpOnly`, `SameSite=Strict` cookie |
| TOTP codes reusable within their 30-second window; no recovery codes | Rate limits; MFA secret replaced only with password + current code | Replay cache per user; recovery codes; owner-assisted MFA reset command (manual procedure: [runbook](RUNBOOK.md#mfa-reset-lost-authenticator)) |
| MFA secrets stored unencrypted in the database | Encrypted EBS; encrypted, access-restricted backups | Application-level encryption (KMS) |
| Rate limits are per API process | Pilot runs one API instance | Redis-backed limits before scaling out |
| Tenant isolation is application-level (no PostgreSQL RLS) | Composite FKs + scoped queries; two-tenant tests | RLS as defense in depth |
| Base images use moving tags (`nodejs24-debian13`, `1.30-alpine`); new CVEs appear over time | CI rescans every build and blocks publication on HIGH/CRITICAL; Dependabot watches Docker references | Pin resolved digests for each promoted release |
| PostgreSQL image (`postgres:16-bookworm`) is not in the CI scan | Private data network only, no published port | Add it to the scan; a distro change needs a collation check on existing volumes |
| Generic audit interceptor is best-effort | Every pilot domain command and access change writes its audit row **in the same transaction** | Make the generic interceptor transactional |
| Email deliverability (SPF/DKIM/DMARC) not yet configured for the sender domain | Delivery failures are reported to the inviter, never shown as success | Configure SES (or approved provider) DNS records before go-live |

## 4. Compliance note

No compliance claim is made. The pilot stores staff identities, customer contact data and
commercial documents for USA and Guinea entities. Data-protection obligations (e.g. U.S. state
privacy law; Guinea's Law L/2016/037 on cybersecurity and personal data) and record-retention
rules need review by qualified counsel before the pilot holds authoritative business data.
