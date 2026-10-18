# CI investigation: bb6c9a4

Status: repairs implemented on `fix/operix-ci-bb6c9a4`; **pipeline not ready**.
AWS publication and staging have explicit `false` approval holds, in addition to the existing variable,
branch and environment conditions. No AWS infrastructure, Tontin, proxy or Cloudflare DNS change is included.

## Observed GitHub failure

Read the actual job metadata and downloaded logs for
[run 39091663142](https://github.com/Kienda/Operix/actions/runs/39091663142), commit `bb6c9a4`:

| Job | Failed step | Root cause |
| --- | --- | --- |
| images | 3: Build all release images on Linux | `COPY public/ ./public/` cannot find `/public`; an empty local directory was never tracked by Git |
| verify | 10: Full authorization and workflow QA | The customer schema rejects `projectManagerUserId`, which the existing assignment policy and shared QA fixture use; all ten suites fail setup |
| verify | 12: Real browser tests | A local `nav` locator shadows the `nav(page)` helper, throwing `TypeError: nav is not a function` |
| verify | 13: Deployment contracts and shell syntax | Runner expands `/mnt/.../*.sh` before starting the container; that mount path exists only inside the container, so literal wildcards reach ShellCheck |
| verify | 14: Existing lint and formatting gates | Existing Prettier violations; the lint script separately runs zero Turbo tasks |
| security | 8: Backend dependency security gate | Actual backend advisory findings, including production transitive dependencies and the old test runner |

`publish` and `staging` were skipped. At inspection, the two deployment variables were unset and no
repository environments existed. No GitHub environment or variable was changed by this repair.

## Fixes and reproduction

- Reproduced the web build failure from an isolated worktree of the committed tree. Added a tracked
  `public/robots.txt` denying indexing for the staff site. The image smoke test checks its actual content,
  not just an HTTP 200 that a SPA fallback might return.
- Reproduced the literal-wildcard ShellCheck failure. Paths now expand relative to the runner checkout,
  then resolve under `docker run -w /mnt`. Bash syntax is checked separately for every shell file; passing
  many files to `bash -n` only checks the first script and treats the rest as arguments.
- Renamed the shadowing browser locator. The completed walkthrough then exposed a real phone-pattern
  error: modern HTML patterns use Unicode `v` rules, which require the literal parentheses/slash/hyphen in
  this character class to be escaped. Fixed the pattern and added browser assertions for both invalid and
  valid phone input. The console-error/network assertion remains intact.
- Added `projectManagerUserId` explicitly to the customer payload schema. It already participates in
  `recordWhere` assignment scoping and `validateRecordData` tenant/branch/user-reference validation. Unknown
  fields remain rejected, and existing reference validation is not bypassed. Two unit regressions cover
  the schema-policy agreement and unknown-field rejection.
- Updated dependencies within their existing major ranges, except the security-required Vitest upgrade
  from 2 to 4.1.12 and Prisma's vulnerable internal `deepmerge-ts` helper from 7 to 8. Migrated the QA worker
  setting to `maxWorkers: 1` and limited permission tests to authored `src` files so Vitest 4 does not run
  compiled `dist` tests a second time. No test files/assertions were removed. Patched Vite/YAML overrides
  resolve the remaining advisories; frozen-install, generation, type checks, unit and migration tests verify
  compatibility. There are no advisory ignores or relaxed severity thresholds.
- Applied the formatter's mechanical changes to the backend so the existing full formatting gate can run.
  The large formatting diff is intentional; it does not implement missing business workflows.
- Retained Node 24, refreshed its OS base to supported Debian 13, applied available runtime OS patches, and
  selected stable Nginx 1.30 plus Alpine security updates. Refreshed Trivy to 0.76.0 and pinned its verified
  Docker digest. Scans still fail on high/critical findings and receive read-only image archives, not the
  Docker socket. Excluded QA `.tmp-build` and coverage output from Docker contexts to avoid shipping or
  repeatedly rebuilding generated test files.
- Added npm/PNPM Dependabot coverage for the root and backend lockfiles. No existing Dependabot PR was
  merged, approved or closed. The existing AWS role, region, ECR, SSM, Compose, network, volume, routing,
  secret and rollback configuration is preserved.

## Local results

| Check | Result |
| --- | --- |
| Backend registry audit after patch | **0 advisories**, including dev/tool dependencies |
| Backend peer dependency check | No peer issues |
| Unit tests | **97 passed** (44 permissions, 53 API, including two new regressions) |
| Backend type checks and build | Passed |
| P0 HTTP/PostgreSQL and migration rehearsals | **27 passed** |
| Pilot API/SMTP/security integration | **31 passed** |
| Browser pilot walkthrough, accessibility/mobile, console/network assertions | **9 passed** |
| Frontend production build and translations | Passed, 347 matching English/French keys |
| Formatting and frozen-lockfile install | Passed |
| Deployment contract tests | **5 passed** |
| Corrected ShellCheck and Actionlint | Passed |
| Full QA | **31 failed, 91 passed, 26 skipped** across 148 cases; remains a blocking check |

The QA result is identical before and after the dependency/test-runner update once the shared schema
setup error is repaired. Thus these remaining failures are not a Vitest-upgrade regression. They include
unsupported receiving/receipt/portal endpoints, attendance pending-checkout lifecycle defects, fixture
payloads that no longer satisfy typed project/task schemas, and generic lifecycle writes that the current
protected-command design deliberately rejects. These need feature/contract and security-policy work;
do not add schema wildcards, weaken permission checks, skip cases or change allowed-operation assertions
solely to obtain a green check. Lint still executes zero tasks and is not meaningful lint coverage.

Linux image build/smoke/scan and the new GitHub run must be assessed separately from the old failed run.
No green-pipeline or production-readiness claim follows from the passing local subset above.

## Dependabot PR review

Reviewed the exact open PR patches against their official upstream release information:

| PR | Compatibility/security review | Disposition |
| --- | --- | --- |
| [#1](https://github.com/Kienda/Operix/pull/1), setup-node 7.1.0 | Changes action implementation/runtime, not `node-version: 24`; hosted Ubuntu 24.04 is compatible with its modern runner requirement. Review automatic-cache behavior and test the actual action before adoption. | Reasonable separate upgrade after required CI passes; not merged |
| [#2](https://github.com/Kienda/Operix/pull/2), Nginx 1.31 | Mainline minor upgrade; verify UID 101, read-only/tmpfs runtime, SPA/API proxying and healthcheck. A newer tag alone does not prove patched OS libraries. | Hold the mainline upgrade; this repair selects stable 1.30 and explicit OS patches, subject to smoke/scan gates |
| [#3](https://github.com/Kienda/Operix/pull/3), checkout 7.0.1 | Major action/runtime and credential-handling changes need runner and least-privilege review. Current use requires read-only checkout, not persisted push credentials. | Separate upgrade after actual CI testing; not merged |
| [#4](https://github.com/Kienda/Operix/pull/4), AWS credentials 5.1.1 | Verified target SHA is the upstream 5.1.1 release commit; same-major patch, no changed role/region/permissions in the diff. OIDC behavior cannot be live-tested without deployment approval. | Low-risk candidate for a separate controlled upgrade; existing pin retained and AWS jobs held |
| [#5](https://github.com/Kienda/Operix/pull/5), Node 26 | Changes application/build runtime major and native Prisma/Argon2 compatibility. Node 24 is LTS; Node 26 is still Current on October 17, 2026. | Defer; keep Node 24 and test any future runtime-major migration explicitly |

Sources: [Node release schedule](https://github.com/nodejs/Release#release-schedule),
[setup-node 7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0),
[checkout 7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1),
[AWS credentials 5.1.1 commit](https://github.com/aws-actions/configure-aws-credentials/commit/61815dcd50bd041e203e49132bacad1fd04d2708),
[Nginx stable/mainline](https://nginx.org/en/download.html),
[Vitest 4 migration](https://v4.vitest.dev/guide/migration.html),
[Trivy releases](https://github.com/aquasecurity/trivy/releases/tag/v0.76.0).
