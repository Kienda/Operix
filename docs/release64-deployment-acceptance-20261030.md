# Operix redesign deployment and acceptance — October 30, 2026

The approved redesign is deployed at https://operix.globalhightech.com and independently
verified through live Playwright. Authenticated and two-tenant acceptance remain blocked
on tester access; they are not reported as passed or as complete end-to-end acceptance.

## Exact release and authorization

- User instruction: "let now deploy", following the exact release/procedure review.
- Commit: `3b70c8754ff4c04335403d1ff5fe3197d9e2f470`.
- Release: `3b70c8754ff4c04335403d1ff5fe3197d9e2f470-41083575411-2`.
- [Workflow #64, attempt 2](https://github.com/Kienda/Operix/actions/runs/41083575411/attempts/2).
- S3 bundle SHA-256, independently matched against diagnostic workflow output:
  `43db9f1203b4d62e140dadf4729a1946b2144620c7e8d31878b451c8283c915c`.
- Bucket: `operix-staging-artifactsbucket-obon06ybaj08`.
- Key: `operix/releases/3b70c8754ff4c04335403d1ff5fe3197d9e2f470-41083575411-2.tar.gz`.
- Object version: `_Qzes5Fx8dJOmy5gAqpkOTU28GtLJo41`; AES256 encryption.
- Existing instance: `i-0ea991afd785b72e0`, us-east-1.
- Fixed SSM document: `Operix-Staging-Release`, version 1.
- Deployment command: `f297f32d-82ac-4aaa-b77c-b7861da2af25`, Success.

Publication was performed through the existing workflow after rechecking exact source,
attempt, switches, successful prerequisite jobs, no competing eligible run and no
existing ECR/S3 release for the target. The approval variable was temporary and removed.
A transient GitHub GET 502 caused the monitor to reset the variable defensively; after
checking that the same attempt was still running its prerequisite and publish had not
been evaluated, monitoring and its temporary gate were resumed. No additional rerun or
release attempt was created. The gate was removed again as soon as the publication
step captured its environment, and absence was verified.

Verify, security, images and publish all succeeded. Workflow staging was deliberately
skipped, and `OPERIX_STAGING_DEPLOY_ENABLED=false` remains unchanged. Deployment then
used the already reviewed fixed operator SSM mechanism under the user's deployment
instruction, without permanently enabling workflow deployment.

## Publication integrity

All seven ECR manifest byte hashes, digest lookups and applicable immutable tags were
independently verified. The five application tags use the new release; PostgreSQL and
Redis retain source tag `2d899cb8f3eab63f2b197a7e04e2efb8aa9ff7a5-39704047009-2`.
All seven repositories are immutable.

| Image | Verified manifest digest |
| --- | --- |
| api | `sha256:f05fda5f96fbe07a9d398199e017dde474bfb61ce5601bd4fe047b7277492d99` |
| worker | `sha256:f052eec0120d3b087efd8c62e3d319df1c77aca0b6830c225d46e45ea631c186` |
| migrate | `sha256:9c0910e16f1e01f15ff3d8c3e74cc52e5f35d366afef2f721741aa055e5c30ae` |
| web | `sha256:95f95a2502b4bd50b2664eaa6f60d96bd4fa9ba7f8391ee2be4ff014b0ce65d4` |
| tunnel | `sha256:0196a216bb0ff94fe506b30d71432e49f7e0b2909a9d8a172f45f12650f70d84` |
| postgres | `sha256:33341234955a890b4832395d16100bcc1bfd0812a38012e8d81b7404bc6eddf9` |
| redis | `sha256:6aa8592b54375bb6c6a1f9f5030d62ce2349f51a59ca4a7dfe7df1da7bf571d5` |

The version-specific S3 download matches the workflow's expected SHA-256. Its archive
paths/schema/release identity were validated, all 74 deployment source files compare
byte-for-byte with the approved commit, and the migration fingerprint matches source.
The published seven-image manifest exactly matches the deployed host manifest and
running service image references. The worker remains disabled.

The existing publisher rebuilt, tested and scanned the candidates and exact retained
supporting content, and read back/rescanned all selected registry images before uploading
the bundle. Required HIGH/CRITICAL gates passed; backend's 3 low/8 moderate dependency
findings remain below that gate. No security check, IAM policy or test was weakened.

## Deployment, preservation and rollback

SSM reported no pending migrations among the five reviewed migration directories.
The current symlink and manifest identify the exact release above. API/web are healthy;
PostgreSQL and Redis are healthy; the tunnel is running and Cloudflare reports healthy.
HTTP readiness and process health checks return 200; anonymous auth/me returns 401.

PostgreSQL/Redis container IDs, named volumes and support-storage identity are unchanged.
Credential fingerprints match the previous release without exposing secret values.
No secret value, infrastructure resource, DNS record, Access policy or routing rule
was changed. Existing per-release runtime files were materialized by the reviewed
deployment script from the existing secret.

Cloudflare's proxied DNS target, tunnel ingress (`http://web:8080`) and Access policy
selectors compare equal before/after. The connector restarted to run its reviewed new
image; Cloudflare configuration was preserved.

Every Tontin container ID, state and restart count matches the baseline. Tontin web/API
remain healthy, Nginx/Redis running; beat/worker were already exited and remain so.
No Tontin service was changed or restarted.

Fresh predeployment database backup:

- File: `20261030T171954Z-3b70c8754ff4c04335403d1ff5fe3197d9e2f470-41083575411-2.dump`.
- Size: 80,868 bytes; `pg_restore --list` validates the archive.
- SHA-256: `df9e8b31b8891ab098b6fd08bfd2e312e3a211dd2435ffea3e80b4c672cc60b6`.
- S3 bucket: `operix-staging-backupsbucket-urxntjv3dvse`.
- Key: `operix-staging/` plus the filename above.
- S3 version: `MiBCG2bcptPm8OJ_06djxd2fFtkAjFkl`; AES256 encryption.
- Native S3 checksum and metadata both match the host's freshly computed checksum.

Rollback target is the retained former current release:

`ce5a205b68ec0e9dc7efcf5c3aee504a0624135a-39888006873-1`

Its bundle/download checksum is
`15dd7f4a0e502f713d281576c3d74850948f94632249ff3cc57ca85fec17ec55`.
The previous symlink now points there. Its seven ECR manifests and S3 bundle were
verified before deployment. Current/previous migration and credential fingerprints
match; support storage is unchanged. Existing `Mode=rollback` through the fixed
document can restore its application images subject to the existing guards. No
rollback was needed. No database restore was executed; archive validation and CI
synthetic restore are not a claim of a fresh full real-host restore rehearsal.

## Live Playwright results

Playwright 1.63.0 with installed Edge ran against the actual HTTPS hostname after
deployment. A fresh browser context confirms the new assets are served, not the old
cached application. All 33 explicit public checks and all ten responsive page checks
passed. Screenshots were visually inspected.

| Requirement | Status | Evidence / remaining limitation |
| --- | --- | --- |
| CI verification | PASS | Exact attempt verify passed |
| Required security gates | PASS | Security and image scans passed; low/moderate findings noted above |
| Seven images | PASS | Build/test/scan and independent seven-manifest verification |
| Publication | PASS | Immutable release, workflow SHA-256 and versioned S3 readback |
| Deployment | PASS | Fixed SSM command Success; exact host manifest and running refs |
| Landing branding | PASS | Teal/navy/gold visible; hero and approved modules present |
| Logo/favicon/icons | PASS | favicon.svg, lockup SVG and app icon compare byte-for-byte with target source |
| Typography | PASS | Montserrat heading and Inter UI computed styles |
| Login page | PASS | Email/password/sign-in/forgot-password; no public registration |
| Invalid credentials/session | PASS | Synthetic nonexistent login and invalid bearer rejected |
| Signed-out protections | PASS | Seven UI routes require login; four protected APIs reject anonymous access |
| Responsive landing/login | PASS | 1440, 1024, 768, 390 and 375 px; no horizontal overflow |
| JavaScript exceptions | PASS | Zero page exceptions |
| Browser diagnostics | FAIL | Existing Cloudflare analytics beacon blocked by CSP; not suppressed |
| Authenticated login/persistence/logout | BLOCKED | Dedicated browser awaits manual approved tester sign-in |
| Dashboard | BLOCKED | Authenticated live acceptance pending |
| Customers / quotations / projects / tasks | BLOCKED | Synthetic live CRUD/workflows require authenticated tester session |
| Team / permissions / account settings | BLOCKED | Authorized authenticated test pending |
| Invoices / inventory / broader finance / reporting / HR | NOT TESTED | Not enabled complete pilot UI workflows; no scope expansion |
| Two-tenant isolation | BLOCKED | Second authorized synthetic tenant/account not provided |
| Tontin preservation | PASS | Exact container IDs/states/restart counts unchanged |
| Rollback readiness | PASS | Retained bundle/images, previous link, matching schema/credentials/storage |
| Full real-host restore rehearsal | NOT TESTED | No database restoration was executed |

Diagnostics across repeated navigation: zero page exceptions, 41 console errors,
20 failed requests to Cloudflare's beacon with CSP blocking, and one expected
invalid-login HTTP 401. These are retained in the report; a clean-console result is
not claimed. No application source or Cloudflare/CSP configuration was changed as a
workaround.

## Evidence and next acceptance step

- [Desktop landing](../tmp/release-64-review/live-after/landing-1440.png)
- [Mobile login](../tmp/release-64-review/live-after/login-390.png)
- Ten screenshots and anonymous trace:
  `tmp/release-64-review/live-after/`.
- Public browser checks/diagnostics: `live-after/report.json`.
- Publication readback: `publication/verification.json` and `completed-logs.txt`.
- SSM deployment evidence: `deployment/command.json` and `invocation.json`.
- Host/Cloudflare/Tontin comparisons: `postdeploy/comparison.json`.
- Fresh backup verification: `postdeploy/backup-verification.json`.
- Detailed predeployment audit: [release64-end-to-end-status-20261030.md](release64-end-to-end-status-20261030.md).

The dedicated browser is open at the newly deployed login page for the user-approved
tester `info@globalhightech.com`. Password and MFA must be entered there, not in chat.
Authentication traffic is not traced; no cookies/tokens are exported. Once signed in,
continue session, dashboard, role/navigation and isolated synthetic workflow testing.
A second authorized synthetic tenant is required to complete the requested live
cross-tenant checks. No authenticated or unexecuted test is marked passed.
