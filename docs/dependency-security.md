# Dependency security verification

Date: 2026-10-18. Committed baseline: 08684c5.

The baseline reproduces exactly 35 findings: 4 critical, 18 high, 12 moderate and 1 low. The working tree already contained uncommitted remediation at the start of this task; those changes were reviewed and validated. The regenerated lockfile passes the unchanged full backend gate, `pnpm --dir backend audit --audit-level=high`, with zero findings of any severity. This includes development and migration tooling. Frontend `npm audit --audit-level=high` also reports zero findings.

## Findings and paths

The [complete inventory](security-audit/findings.md) identifies all 35 original findings, advisory links, affected packages, baseline versions, patched ranges and final versions. The [baseline JSON](security-audit/backend-before.json) contains every dependency path. Final evidence: [backend](security-audit/backend-after.json) and [frontend](security-audit/frontend-after.json).

Representative paths include API -> Nest platform-express -> Express -> proxy-addr; API -> Nest CLI -> Angular devkit/webpack -> AJV -> fast-uri; database -> Prisma -> @prisma/config -> deepmerge-ts; and each test workspace -> Vitest -> Vite -> PostCSS -> source-map-js/nanoid. All five Vitest workspaces were updated.

## Versions and compatibility

| Dependency | Baseline / previous manifest | Reviewed version |
| --- | --- | --- |
| Nest common/core/platform-express/testing | ^11.0.1 | 11.2.7 aligned |
| Nest Swagger | ^11.0.3 | 11.4.7 |
| Nest CLI | ^11.0.0 | 11.0.24 pinned |
| Prisma client and CLI | ^6.2.1, already resolved 6.19.3 | 6.19.3 pinned together |
| Vitest, five workspaces | ^2.1.8, resolved 2.1.9 | 4.1.11 |
| Vite in backend tests | 5.4.21 | 8.2.0 |
| proxy-addr | 2.0.7 | 2.0.8 |
| qs | See baseline audit | 6.16.0 |
| multer | 2.2.0 | 2.4.0 |
| js-yaml | 4.3.1 / 5.2.1 | 4.3.2 / 5.4.2 |
| fast-uri | 3.1.5 | 3.1.8 |
| brace-expansion | 1.1.18 / 5.0.9 | 1.1.21 / 5.0.12 |
| deepmerge-ts under Prisma config | 7.1.5 | 8.0.2 |
| nanoid | 3.3.17 | 3.3.18 |
| source-map-js | 1.2.1 | 1.2.2 |
| tinypool | 1.1.1 | Removed through Vitest upgrade |

Vitest 4 is a deliberate development-tool major upgrade. It removes the vulnerable tinypool dependency rather than forcing an incompatible tinypool major underneath Vitest 2. Vitest 4 supports Vite ^6, ^7 and ^8. The broad Vite override was removed; its compatible range naturally resolves Vite 8.2.0. The backend Node requirement is now ^22.12.0 or >=24.0.0; CI already uses Node 24. Older development Node installations must upgrade. Vite emits a future config-loader warning for existing CommonJS TypeScript configs; current execution passes.

Prisma stays on major 6. Both client and migration CLI are pinned to the same version. No schema changes or Prisma 7 adapter migration were introduced. Prisma 6.19.3 pins deepmerge-ts 7.1.5, and the advisory affects all releases before 8. The 8.0.2 override is scoped to @prisma/config only. This is an explicit cross-major exception. Prisma uses the exported deepmerge function through c12, rather than the renamed TypeScript types or deepmergeInto alias-mutation behavior changed in version 8. Dedicated tests exercise real Prisma config loading and cyclic merging, alongside generation and real migration rehearsals.

Other overrides retain existing majors and correct vulnerable transitive pins. They should be reviewed when parent packages update. Root React/Vite manifests need no changes; the frontend audit is already clear. PostgreSQL/Prisma, React/Vite, NestJS and BullMQ architecture is preserved.

## Validation

Validated on Node 24.18.0 / pnpm 11.1.3, using the current working tree:

| Check | Result |
| --- | --- |
| Backend lockfile regeneration and frozen install | Pass, all 8 workspace projects |
| Full backend audit including migration tooling | Exit 0; 0 critical/high/moderate/low |
| Frontend audit | Exit 0; 0 findings |
| Backend production build --force | 7 packages passed |
| Backend TypeScript checks --force | All passed |
| Backend unit tests --force | 111 passed before adding the 2 Prisma compatibility tests |
| Added Prisma configuration/recursive merger tests | 2 passed |
| P0 integration and migration rehearsal | 27 passed across 2 files |
| Pilot HTTP/SMTP integration using local Mailpit | 31 passed |
| Full workflow/authorization QA | 126 passed; 22 expected failures, exit 0 |
| Frontend production build | Pass, Vite 8.2.0 |
| Translation check | Pass, 347 keys per language |
| Prisma generation and schema validation | Pass, CLI/client 6.19.3 |
| Backend Prettier format check | Pass |

The existing `pnpm --dir backend lint` exits 0 but runs no tasks because no workspace defines a lint script. It is not evidence of static lint analysis; no security gate was changed to hide this gap. QA's 22 expected failures remain existing test coverage gaps, not newly passing scenarios. Image builds/scans and browser tests were not rerun in this dependency pass; those remain GitHub Actions checks.

The dependency security gate is ready for a new CI run. Full branch readiness is not certified: validation used a working tree with substantial pre-existing uncommitted application/deployment changes, which are outside the remediation commit. Review and commit the intended application changes separately before relying on these working-tree test results for a clean checkout.

## Scope

The remediation commit contains only dependency manifests, workspace/lockfile, Prisma compatibility tests and this report/evidence. Existing unrelated application, email, deployment and infrastructure edits are preserved and left uncommitted. No advisory ignores, audit suppression or weakened security gates were added. No Tontin changes, workflow dispatch, push, AWS switch changes or staging deployment were performed.
