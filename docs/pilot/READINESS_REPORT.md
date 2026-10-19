# Deployment readiness report — GHT USA & Guinea pilot

Date: 2026-10-18 · Scope: restricted production pilot for authorized GHT staff · Evidence: [TEST_EVIDENCE.md](TEST_EVIDENCE.md)

## Verdict

**Not yet released to staff.** All code-level security and workflow gates pass on the current tree
(P0 27/27, pilot API 31/31, QA 126 + 22 documented gaps, browser 9/9, 0 dependency advisories,
0 HIGH/CRITICAL image findings, production Compose smoke test). The pilot is **ready to deploy to
restricted staging** as soon as you approve the infrastructure steps in "Blocked" below. Staff access
follows only after the host-level gates (TLS, SMTP, backup restore, monitoring, tester acceptance) pass
on the deployed system. No live infrastructure, DNS or public deployment has been created.

## Ready for staff use (once deployed and the blocked gates pass)

| Capability | Notes |
| --- | --- |
| Invitation-only accounts, password reset, sign-out | Emailed single-use links; no shared or demo accounts; rate-limited |
| Two-factor authentication | Mandatory for Owner and Administrator, optional for others |
| Team management | Invite, change role/branch, suspend/reactivate; delegation ceiling; audited |
| GHT organization with USA (USD) and Guinea (GNF) branches | Created by the idempotent `bootstrap-pilot` command |
| Eight pilot roles | Owner, Administrator, Finance (read-only), Project Manager, Sales Manager, Sales Rep, Production, Employee — [access matrix](ACCESS_MATRIX.md) |
| Customers | Branch-owned; financial fields permission-gated |
| Quotations | Server-numbered, server-priced (USD/GNF/EUR), Draft → Sent → Accepted/Declined/Cancelled |
| Projects | From an accepted quotation or a same-branch customer; Start/Hold/Resume/Complete/Cancel |
| Tasks | Assign to activated branch staff; employees see and update only their own |
| Dashboard and audit log | Live data only; no sample figures or dead buttons |
| English and French, phone layout | 347 translated keys; tested on a phone viewport |

The [pilot workflow](PILOT_WORKFLOW.md) describes the flow staff will follow.

## Restricted or disabled

| Item | State | Condition to enable |
| --- | --- | --- |
| Finance (invoices, payments) | Disabled by DB **and** deployment ceiling. Transaction-integrity tests pass | Read endpoints, receipts, reversals, opening balances, accounting sign-off |
| Inventory movements | Disabled likewise. Concurrency tests pass | Stock card, transfers/reservations, opening stock reconciliation |
| Background worker (notifications, exports) | Built and scanned, not started | Real delivery, retry/idempotency tests |
| API documentation (Swagger) | Off in production | Explicit `SWAGGER_ENABLED=true` |
| Organization settings and branches | Owner only | — |
| Scale-out | One API instance (rate limits are per process) | Redis-backed limits |
| Pilot decisions D1–D7 | Shipped with the defaults in the access matrix | Your confirmation or changes |

## Blocked — needs your approval or information

| # | Gate | What is needed | Prepared in repo |
| --- | --- | --- | --- |
| B1 | AWS resources | Account ID, exact EC2 instance ID and role; approval to apply the CloudFormation template (ECR, S3, OIDC roles, SSM document) | `deploy/aws/operix-staging.template.json` |
| B2 | Shared host inspection | Approval for a **read-only** look at Nginx, ports, Docker networks, memory/disk/CPU credits so Tontin is not affected | Commands in `deploy/README.md` |
| B3 | DNS and HTTPS | Hostnames, DNS A records, certificates (e.g. Let's Encrypt), tester IP allowlist | `deploy/nginx/operix-edge.conf.example`, HSTS/CSP headers |
| B4 | Email delivery | SMTP provider (e.g. Amazon SES) credentials; SPF, DKIM, DMARC on the sender domain | API refuses to start in production without SMTP |
| B5 | Secrets | Create the dedicated Secrets Manager secret (+ KMS key) with generated values | `deploy/secrets.example.json`, `prepare-secrets.py` |
| B6 | GitHub | Protected `main`, `operix-images`/`operix-staging` environments with required reviewers, repository variables; then turn on `OPERIX_AWS_ENABLED` / `OPERIX_STAGING_DEPLOY_ENABLED` | `.github/workflows/operix.yml` |
| B7 | Monitoring and logs | CloudWatch agent for container JSON logs; alarms for readiness, disk, memory, CPU credits, backup age; set `OPERIX_PUBLIC_URL` for the external probe | `.github/workflows/operix-uptime.yml` |
| B8 | Backups | Install the timer, first S3 upload, **restore rehearsal on the host**, agree retention (proposed ≥ 90 days, RPO 24 h, RTO 4 h) | `deploy/scripts/backup.sh`, `restore-rehearsal.sh`, [runbook](RUNBOOK.md) |
| B9 | Acceptance on the deployed pilot | 1 tester per role/branch runs the workflow, including denied-access checks; sign-off recorded | [onboarding procedure](STAFF_ONBOARDING.md) |
| B10 | Data protection review | Counsel review for U.S. state privacy law and Guinea Law L/2016/037 before authoritative data | — |

## Not implemented

Invoices/payments UI, receipts and statements · inventory UI · procurement, purchase approvals, goods
receiving · expenses · HR, payroll, attendance, guard patrols · contracts and their execution · lead
conversion · project milestones · customer portal · PDF export and emailed documents · queued
notifications · MFA recovery codes and self-service MFA reset (manual procedure in the runbook) ·
refresh token in an HttpOnly cookie · PostgreSQL row-level security · backend lint baseline (lint runs
zero tasks; TypeScript strict typecheck and Prettier are enforced).

## Security posture

[Security remediation report](SECURITY_REMEDIATION.md): 10 audit P0 findings re-verified fixed, 24
new findings fixed (secrets, brute force, invitation/reset integrity, session rotation, delegation,
server-side pricing, numbering, validation, headers/CSP, audit-log immutability, dependency and base
image vulnerabilities). Residual risks are listed there with mitigations; none blocks a restricted
pilot with the gates above.

## Deliverables

| Deliverable | Location |
| --- | --- |
| GHT pilot workflow | [PILOT_WORKFLOW.md](PILOT_WORKFLOW.md) |
| Role/access matrix | [ACCESS_MATRIX.md](ACCESS_MATRIX.md) |
| Test evidence | [TEST_EVIDENCE.md](TEST_EVIDENCE.md), `e2e/evidence/` screenshots |
| Security remediation report | [SECURITY_REMEDIATION.md](SECURITY_REMEDIATION.md) |
| AWS deployment configuration | `deploy/` — [deploy/README.md](../../deploy/README.md), [verification](../../deploy/verification.md) |
| GitHub Actions pipeline | `.github/workflows/operix.yml`, `operix-uptime.yml` |
| Staff onboarding procedure | [STAFF_ONBOARDING.md](STAFF_ONBOARDING.md) |
| Backup and rollback runbook | [RUNBOOK.md](RUNBOOK.md) |

## Recommended next steps (in order)

1. Confirm decisions D1–D7 and the first-wave tester list.
2. Approve B2 (read-only host inspection) and provide the B1 identifiers.
3. Approve B1, B5, B6; choose the SMTP provider and hostnames (B3, B4).
4. Deploy to restricted staging (tester IPs only), then complete B7, B8, B9.
5. Owner sign-off → onboard the first wave; review access monthly.
