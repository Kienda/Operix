# Workflow 10 remediation

Original run: [39182359043](https://github.com/Kienda/Operix/actions/runs/39182359043), commit `08684c542894c838f86101b0a91ff272cf9d7af8`. Fix branch: `fix/workflow-10-ci`. No deployment or AWS switch changes are authorized by this work.

## Reproduction and causes

Complete failed verify, images and security job logs were downloaded and inspected before changing the affected workflows. Local reproduction uses an isolated checkout under `tmp/workflow-10-baseline`; original advisory evidence is in [security-audit](security-audit/findings.md).

| Failure | Exact command / cause | Correction |
| --- | --- | --- |
| Backend audit | `pnpm --dir backend audit --audit-level=high`: 35 findings, including 4 critical and 18 high | Compatible dependency updates and scoped overrides; full audit includes Prisma CLI and development tools, with zero findings |
| Full QA | `pnpm --dir backend --filter @operix/api test:qa`: all 10 suites failed in shared setup, 148 tests never ran; customer schema rejected `projectManagerUserId` | Align schema with assignment fields already recognized by the scope policy; retain reference validation for organization and branch |
| Additional QA gaps | Removing inherited expected-failure annotations exposed 22 cases, including missing features and incorrect assumptions about role scopes | Implement features at the user's request; use dedicated domain commands and portal routes, and preserve denials where the catalog deliberately grants no permission |
| Deployment step | Python contracts passed (5 tests in the original run), as did Bash syntax; ShellCheck received literal `/mnt/.../*.sh` because host glob expansion could not see container paths | Expand relative tracked paths on the host and run ShellCheck with `/mnt` as working directory; check each shell script with `bash -n` individually |
| Image build | `COPY public/ ./public/` failed because Git does not track the absent/empty directory | Remove that unnecessary COPY; retain the actual Vite source and security configuration |
| Formatting | `pnpm --dir backend format:check`: 66 files in Linux CI; Windows baseline also reports checkout line-ending differences | Apply the existing `.prettierrc`; include the generated lockfile in checks instead of exempting it |
| Lint | `pnpm --dir backend lint`: Turbo ran zero tasks because no workspace had a lint script or ESLint configuration | Add supported ESLint 10, TypeScript parsing, recommended correctness rules, TypeScript-aware unused-variable checks, zero warning tolerance, and lint scripts in all seven workspaces. Root config changes invalidate Turbo lint caches |

## Implemented features and safeguards

- Lead conversion: qualification, exact convert/create permissions, visible lead, atomic numbered customer creation, audit and idempotent conversion retries.
- Finance reads and receipts: exact read permissions; existing tenant/branch/creator policies; receipts only for verified payments, with stable per-tenant numbers derived from immutable payment numbers. Receipt output excludes internal verification identities and proof URLs.
- Customer portal: dedicated read-only `/portal` routes with linked-customer scope, explicit portal/product enablement and output allowlists. General staff routes remain protected. Existing production module ceilings remain unchanged; the portal is opt-in.
- Contract execution: approval, signed document attachment and countersign commands enforce state, permission, tenant and branch checks. Generic PATCH cannot execute a contract or forge signing metadata. Execution opens the existing project gate without disabling it.
- Expenses and procurement: permission-checked, audited approval commands; requester cannot approve their own expense/request. Approved expense amounts and sent purchase order data are immutable through generic PATCH.
- Goods receiving: planned item limits, partial receipts, replay/conflict handling, one serializable transaction for order/ledger/audit, and reuse of the existing ledger reconciliation/balance checks. Generic order-linked stock receipts cannot bypass the receiving command.
- Milestones and guard assignments: existing BusinessRecord storage, exact management permissions, parent branch validation, organization/branch user reference validation, and bounded shift windows.
- Patrol scans: active checkpoint/route, same site/branch, current guard assignment, server capture time, audit and idempotency checks.
- Attendance: review status no longer means a shift is open. Checked-out pending shifts cannot be checked out again or block a new shift. Checkout uses an atomic compare-and-update.

No expected-failure annotations, skips, blanket audit exclusions, role grants, tenant/branch relaxations, finance verification changes, inventory reconciliation changes or deployment bypasses are introduced to make tests pass. Test fixtures explicitly assign records where required, and tests now exercise the dedicated commands instead of attempting protected generic state changes.

## Package versions

The dependency fixes inherited from the earlier remediation remain: Nest common/core/platform-express/testing 11.2.7, Swagger 11.4.7, CLI 11.0.24; Prisma client and migration CLI 6.19.3 pinned together; Vitest 4.1.11; Vite 8.2.0; source-map-js 1.2.2 and the patched transitive versions listed in the advisory inventory. This pass adds ESLint 10.13.0, @eslint/js 10.0.1 and typescript-eslint 8.71.2. Backend Node requires 22.13+ or 24+ to match the lint toolchain; CI already runs Node 24.

## Validation status

Results and the pull request's final GitHub Actions URLs will be recorded after the complete checks finish. Local unit, scope regression and feature integration checks are not a substitute for the GitHub workflow's verification, security and image jobs. Publication and staging must remain skipped for the PR.
