# Operix Backend

Production-oriented NestJS backend for the Operix multi-tenant operations platform.

## Quick start

1. Copy `.env.example` to `.env` and replace every production secret.
2. Start PostgreSQL, Redis, MinIO and Mailpit: `pnpm infra:up`. The Docker Postgres container publishes on host port **55432**, not 5432 — many developer machines already have a native PostgreSQL service bound to 5432, which silently steals the connection instead of erroring, so the compose file shifts off it.
3. Install and generate: `pnpm install && pnpm db:generate`.
4. Apply the schema: `pnpm db:migrate` (development) or `pnpm db:deploy` (production).
5. Seed the internal workspace: `pnpm db:seed`.
6. Run: `pnpm api:dev` and `pnpm worker:dev`.

Swagger is available at `http://localhost:4000/docs`; health is at `/api/v1/health`.

Prisma's CLI reads `.env` from the current working directory. Because `pnpm --filter @operix/database ...` runs with that package as its cwd, keep `packages/database/.env` in sync with the root `.env` (copy it after editing) so `migrate`/`studio`/`seed` see the same `DATABASE_URL`.

Seed login: `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD` from `.env` (defaults to `admin@globalhightech.com` / `ChangeMe!2026`) for organization slug `global-high-tech`. Change it immediately outside local development. The seed also creates the full 26-role Operix system-role catalog (`@operix/permissions`) for the tenant, each with its real permission list rather than a wildcard.

## Security model

Every protected request requires both `Authorization: Bearer <token>` and `x-organization-id`. The server resolves organization membership itself and never trusts client-provided roles or permissions. Every tenant-owned query includes `organizationId`; branch access is checked against membership scope. Financial verification, inventory movement and the contract-requirement gate use database transactions or an audited override. Sensitive records are archived or reversed rather than deleted, and mutations emit audit events. Passwords use Argon2id; MFA is TOTP-based (`otplib`); password-reset and invitation tokens are single-use and stored only as a SHA-256 lookup hash, never in plaintext.

## API groups

- `/api/v1/auth`: login (with optional TOTP `mfaCode`), rotating refresh, logout, current identity, `forgot-password` / `reset-password`, `invitations/accept`, and `mfa/enroll` / `mfa/confirm` / `mfa/disable`
- `/api/v1/organization`: settings, branches, users, roles, audit history, `invitations` (create/list)
- `/api/v1/records/:module`: tenant-scoped CRUD for business domains
- `/api/v1/finance`: invoices, payment recording/verification, summaries
- `/api/v1/inventory`: items and atomic stock movements
- `/api/v1/projects/:id/start`: enforces the contract-requirement gate — blocks a project from starting until a linked contract record reaches `COMPLETED` (fully executed), unless the caller holds `contracts.override_gate` and supplies a written `overrideReason`, which is audit-logged
- `/api/v1/attendance`: GPS `check-in` / `:id/check-out`, `:id/approve`, `mine`, `pending` — geofences live as `BusinessRecord` rows (module `geofences`) per branch; an out-of-zone or low-accuracy check-in is accepted but left `PENDING` for supervisor approval rather than hard-rejected

Supported resource modules cover customers, leads, services, quotations, contracts, projects, tasks, work orders, expenses, suppliers, procurement, production, employees, leave, payroll, geofences, patrols, checkpoints, incidents, visitors, assets, documents, notifications, and reports.

### Password reset, invitations and MFA

`forgot-password` and invitation creation currently log the reset/invite link via `console.log` rather than sending real email — search the API logs for `password_reset_requested` / `invitation_created` in local development. Wire a real provider (Resend/SES/SMTP) behind the same call site before shipping to production; the `MAIL_DRIVER` env var and `@operix/config` already model that switch.
