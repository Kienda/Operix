# Multi-role employee access

Development implementation and verification, November 3, 2026. No production deployment, live schema change, or real employee permission change was performed.

## Read-only architecture findings

The active entry is `src/entry.jsx`, which mounts the pilot React application. The older `src/main.jsx` prototype is not the implementation target. The audited baseline is `docs/OPERIX_SYSTEM_AUDIT.md`, supplemented by the current source and tests.

- NestJS AccessGuard is global. It verifies the bearer JWT, database session, active user/membership, organization header, subscription/workspace policy and MFA before resolving route permissions.
- OrganizationUser previously contained a single tenant-composite roleId, branchIds, identity links, permissionOverrides and isOwner. Role contains exact permissions and dataScope. Eight GHT pilot roles already exist; no role definitions or permission catalogs were changed.
- Permissions are resolved from database state on every protected request; JWTs contain identity/session references rather than authoritative permission claims. Record queries additionally apply tenant, branch, assignment/self/customer and field restrictions.
- The existing delegation ceiling checks enabled-module capabilities, data scope, branch scope, tenant role allowlists and owner status. Membership editing rejects self changes. These controls remain in force for every current and requested role; suspension/reactivation now also checks all assigned roles.
- Authentication already proves enabled MFA on login, and target-role enrollment policy is enforced by AccessGuard. Switching uses the existing authenticated session and never issues an authentication or MFA bypass token.
- The existing branch model is an authorized branch scope, not a global selected-branch session. The user menu displays that scope (the branch name for a single-branch employee; authorized names or all branches otherwise). No new branch switching or broader branch access was introduced.

## Implementation

`MembershipRole` adds explicit tenant-scoped assignments. The legacy roleId remains an explicit grant and the default role, including for old invitations and provisioning paths. The assignment UI sends roleIds and requires at least one. Existing roleId API clients remain supported; an explicit roleId replaces the role set, while branch-only updates preserve it.

`Session.activeRoleId` selects one assigned role per session. Authorization uses that role's permissions and dataScope, combined with the existing explicitly assigned membership overrides, module ceiling, identity links and unchanged branch ceiling. Other assigned roles' permissions are never unioned. Owner authority additionally requires both existing ownership and an active owner role.

`POST /auth/switch-role` validates a UUID, rechecks the assignment and session inside a serializable transaction, changes the selection, and writes ROLE_SWITCHED with actor, tenant, session and before/after role IDs. `GET /auth/me` returns the active role, safe assigned-role summaries and current branches. There is no arbitrary role header or client-side permission input.

Assignment changes are transactional, audit both roleId (compatibility) and roleIds, retain the default if still assigned, and replace it with a remaining assigned role otherwise. Removed active selections are cleared on every affected session. Subsequent requests immediately use the valid default; attempting to select a revoked role returns 403. A dangling selection created outside the supported assignment API fails closed.

The user menu contains employee name, active role selector, only assigned choices and branch scope. Successful switching reloads the authoritative profile, recalculates navigation, remounts the screen to discard old role data and returns to the dashboard. Refresh preserves the session selection; a fresh login uses the valid default. Assignment and switch errors remain visible and do not report success. The existing dialog provides focus trapping and Escape handling; checkboxes and selects have accessible labels. English and French labels are supplied.

## Migration and compatibility

Migration: `backend/packages/database/prisma/migrations/20261103120000_multi_role_access/migration.sql`.

1. Add nullable Session.activeRoleId and the membership tenant/ID unique index.
2. Create MembershipRole with composite tenant foreign keys and unique membership/role grants.
3. Backfill every non-null legacy roleId, preserving identifiers and all existing membership fields.
4. Commit atomically. Existing sessions have null selection and continue with their default role.

The standalone rehearsal applies all earlier migrations to a new local UUID schema, creates legacy synthetic data, applies the new migration, verifies roles/branches/overrides/sessions, rejects duplicate and cross-tenant grants, and drops only its generated schema. Browser and API harnesses similarly restrict themselves to local PostgreSQL and disposable schemas.

## Verification

All checks use synthetic data. The browser fixture creates an isolated Global High Tech (GHT) synthetic tenant with the existing eight pilot role definitions, two branches and synthetic administrator/employee accounts. It never changes the real GHT tenant.

| Check | Result |
|---|---|
| Backend workspace build | PASS |
| API typecheck | PASS |
| API unit/regression tests | 100 passed |
| Permissions tests | 44 passed |
| Validation tests | 4 passed |
| Database package tests | 2 passed |
| P0 HTTP/database/migration regression | 27 passed |
| GHT pilot HTTP/security regression | 52 passed |
| Complete Playwright suite | 24 passed, including desktop and mobile multi-role cases |
| New migration with legacy data | PASS |
| English/French key parity | PASS |

The multi-role Playwright scenarios verify administrator UI assignment; only assigned options; Sales Representative, Project Manager and Production switching; sidebar removal/addition; a real task creation allowed only after switching; forbidden operations returning 403; cross-tenant organization/role rejection; branch write rejection and hidden branch records; selection persistence on page reload and refresh-token rotation; valid default on re-login; immediate revocation enforcement using the same bearer token; audit events; all other approved non-owner roles; target-role MFA policy; and anonymous/revoked-session switching denial. The existing full-suite owner activation/MFA tests continue to pass. Mobile is exercised at 390 x 844 and desktop at 1440 x 1000 using installed Edge. Width overflow is asserted.

Screenshots are in `e2e/evidence/multi-role/`: desktop-assignment.png, mobile-assignment.png, desktop-switcher.png and mobile-switcher.png. The saved HTML report for the final multi-role acceptance run is `e2e/evidence/multi-role/report.html`. A role selector uses native options; its collapsed screenshot does not show the full option list, which the test asserts directly.

Reproduce from the repository root with local PostgreSQL/Mailpit available:

```powershell
pnpm --dir backend build
pnpm --dir backend test
pnpm --dir backend --filter @operix/api test:p0
pnpm --dir backend --filter @operix/api test:pilot
node scripts/test-multi-role-migration.mjs
npx playwright test
npm run check:i18n
```

## Deployment plan (requires separate approval)

1. Review this change and migration; back up the target database and rehearse restore. Inspect target membership/role counts and validate tenant relations without changing real employee assignments.
2. Rehearse migration and the above tests against an approved staging copy with synthetic accounts. Confirm the eight existing GHT roles and organization allowlist; do not reseed or overwrite real roles.
3. In a maintenance window, pause API writes, apply the additive migration using the approved deployment process, verify backfill counts against non-null default roles, deploy compatible API/web artifacts, then resume traffic.
4. Smoke-test assigned roles, MFA, tenant/branch boundaries and audit records with approved synthetic GHT accounts. Monitor 401/403/500 rates and ROLE_SWITCHED/MEMBERSHIP_UPDATED events.
5. Grant real employees additional roles only under a separately approved access change.

## Rollback plan (requires separate approval)

Pause writes and preserve the migration/audit data. Prefer rolling forward with a fix. If rolling back the application, revoke affected sessions so no user continues under an unexpected default-role context; restore the previous API/web pair together. Leave the additive table/column in place: the previous application reads legacy roleId and ignores the additions. Only each default role is available through the old application; retain secondary assignments for recovery. Freeze role/branch administration while running the previous version, and reconcile both default and secondary grants before a later forward deployment; the old writer does not maintain the assignment table. Do not drop the new table while multiple assignments are in use, run seeds, or rewrite audit history. A later schema rollback requires an approved export/restore plan and separate review of data loss. Validate sign-in, default permissions, branches and tenant isolation before reopening traffic.

Requests already authorized before a revocation can finish; revocation applies to authorization of subsequent requests. As before, the local pilot's enabled product modules bound role capabilities: this feature does not enable disabled production, finance or HR modules.
