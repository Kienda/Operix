# Operix end-to-end release status — October 30, 2026

Status: audit and anonymous live baseline complete; publication awaiting explicit approval.
Deployment and post-deployment acceptance have not occurred. No application, workflow,
AWS infrastructure, secret, Cloudflare configuration, DNS, database or Tontin service
was changed. The only remote command sent was a reviewed read-only SSM audit.

## Actual release blocker

Current main is `3b70c8754ff4c04335403d1ff5fe3197d9e2f470`.
[PR #21](https://github.com/Kienda/Operix/pull/21) merged to that commit but changed
only `docs/publication-run62-review-20261030.md`. Its title, "Fix publication issue",
does not mean the workflow or approval configuration changed.

[Run #64](https://github.com/Kienda/Operix/actions/runs/41083575411), attempt 1,
was a push to main. Verify, security and images, including their individual required
steps, passed. Publish and staging are skipped with zero executed steps. The
check-suite outputs have no text, summary or annotations explaining an expanded
expression. No historical server-side expression trace is available from these APIs.
[Run #62](https://github.com/Kienda/Operix/actions/runs/40994366612) had the same
gate, with workflow_dispatch on main at `1f312508b8b4c2c8e9cb506268bc125ed26c0907`.

The workflow's publication condition is:

```text
success() && needs.verify.result == 'success' &&
needs.security.result == 'success' && needs.images.result == 'success' &&
github.ref == 'refs/heads/main' && github.event_name != 'pull_request' &&
vars.OPERIX_AWS_ENABLED == 'true' &&
vars.OPERIX_SUPPORT_PUBLICATION_APPROVED == 'true'
```

Current authenticated GitHub variable listings show `OPERIX_AWS_ENABLED=true`,
`OPERIX_STAGING_DEPLOY_ENABLED=false`, and no publication approval variable at
repository or either environment scope. Thus the publication-approval condition
is unmet in the current configuration; dependencies, branch and event qualify.
Staging also depends on successful publication and requires its separate false
switch to become true. There are no dispatch inputs.

Both environments still exist with main-only branch rules and no required reviewer
rule. Main is unprotected. The existing repository switch is not bound to one run;
publication must use a brief, monitored approval window. No permanent switch,
workflow bypass, new PR, IAM expansion or automatic deployment is needed.

## Source and security evidence

PR #19's merged branding changes are ancestors of current main. There are no
changes under `src`, `public` or `index.html` between that merge and current main.
The target contains the teal/navy/gold identity, SVG and app icons, Montserrat and
Inter fonts, branded pilot landing/login/dashboard, invitation-only authentication
and existing password activation. The web Dockerfile builds the pilot entry path.

Run #64 built and passed HIGH/CRITICAL scans for api, worker, migrate, web, tunnel,
postgres and redis. Supporting-image scans, synthetic restore/persistence and
application/migration compatibility steps also passed. Frontend audit reports zero
vulnerabilities; backend audit reports 3 low and 8 moderate, with no HIGH/CRITICAL
findings. Passing gates do not mean no findings at every severity. Trivy's vendor
severity and Alpine EOL-list coverage warnings remain.

The existing publisher retains the approved PostgreSQL and Redis ECR digests,
pushes five new application images, and generates a seven-image digest manifest.
Its source/input lock validates. CI's freshly built supporting candidates are not
a substitute for testing those retained registry bytes: publication pulls, tests
and scans the selected retained content before pushing, and reads back/rescans all
seven selected images before the S3 bundle upload.

Complete current ECR repository inventories contain no tags for current main.
S3 has no release bundle under its full SHA prefix. No current-main release exists
to reuse, and no active release run appeared in the latest 30-run listing.

## Existing host, routing and rollback baseline

- Account: `471112967488`; region us-east-1; existing instance
  `i-0ea991afd785b72e0`, t3.large, SSM Online.
- Current deployed release:
  `ce5a205b68ec0e9dc7efcf5c3aee504a0624135a-39888006873-1`.
- Current rollback candidate for the proposed update is that running release,
  not the older `previous` symlink. Its S3 bundle was downloaded by version and
  matches the host manifest/migration fingerprint. Downloaded SHA-256:
  `15dd7f4a0e502f713d281576c3d74850948f94632249ff3cc57ca85fec17ec55`.
  This computed checksum is a fresh rollback reference, not a claim of comparison
  with an independently retained original workflow output.
- The host's previous link currently points to
  `2d899cb8f3eab63f2b197a7e04e2efb8aa9ff7a5-39704047009-2`.
- Operix web, API, PostgreSQL and Redis are healthy, with zero recorded restarts;
  tunnel is running and Cloudflare reports it healthy. Worker remains disabled.
- Loopback web port is 127.0.0.1:18080. API/database/Redis expose no public ports.
  Operix volumes and networks are distinct from Tontin's.
- Available memory 6656 MiB; free disk 82,749,476 KiB. These exceed script minima
  at inspection time; recheck immediately before deployment.
- Root EBS is encrypted, 100 GiB. IMDSv2 is required; Operix IMDS guard is active.
- Five database migrations are recorded, none unfinished; application role has no
  superuser, role-creation, database-creation or BYPASSRLS privilege.
- Target migration fingerprint equals current:
  `f5f3c5e344eca5d7cdd4aa79ce65fd96e96cec807b7eb9ea7c9bb86e6b13f3f4`.
  No new schema migration is present. Existing deploy still runs migrate deploy.
- Database/Redis digests and storage identities are retained. Credential equality
  remains an enforced deployment-time check; no secret values were read out.
- Scheduled backup timer is active/enabled. Latest backup is
  `operix-staging/scheduled/20261030T063526Z-scheduled.dump`, 80,868 bytes,
  S3 version `Pmrii15i2nQAV9eZzOHIH11PmryPrYJZ`, AES256 encrypted. Its S3 native
  SHA-256, metadata and host marker agree on
  `da09b4cee39d3156ff7f37232170d9ffcb0d8adacf64499d17b6845da31a9dce`.
  Fresh real-host restore rehearsal was not executed in this audit. CI synthetic
  restore passed. Do not equate backup existence with a newly proven full restore.
- Runtime file names and API secret key names were checked without values.
  API keys are DATABASE_URL, JWT_ACCESS_SECRET, SMTP_USER and SMTP_PASSWORD;
  database/Redis password files and tunnel token file are present.
- Tontin web/API/Redis are healthy; Nginx is running. Its beat and worker containers
  were already exited at baseline. No Tontin maintenance is authorized or needed.

Public DNS resolves through Cloudflare; the proxied CNAME targets the existing
Operix tunnel, whose ingress is `http://web:8080`, with a final 404 rule. Access
currently contains an email allow policy and an everyone bypass policy; the public
landing and app login remain accessible. No Access/routing changes were made.
Configuration was read through Cloudflare's existing API, including the documented
[tunnel configuration endpoint](https://developers.cloudflare.com/api/resources/zero_trust/subresources/tunnels/subresources/cloudflared/subresources/configurations/methods/get/).

## Actual live Playwright baseline

Playwright 1.63.0 with installed Microsoft Edge tested the actual HTTPS hostname,
without localhost substitution, mocked APIs, session export or credential logging.
Ten screenshots cover landing/login at 1440, 1024, 768, 390 and 375 px.

| Requirement | Status | Evidence / limitation |
| --- | --- | --- |
| CI verification | PASS | Run #64 verify and individual checks |
| Required security threshold | PASS | Run #64 scans/audits; low/moderate findings remain |
| Seven candidate builds | PASS | Run #64 images steps |
| Current-main publication | BLOCKED | Explicit approval not yet given; ECR/S3 absent |
| Deployment of redesign | NOT TESTED | No deployment authorized or executed |
| HTTPS landing and routing | PASS | 200; no redirect to Tontin or Access |
| Hero headline/description | PASS | Correct existing text appears on the old landing |
| Approved redesign live | FAIL | Old blue branding; no declared favicon, no Montserrat/Inter; approved module section absent |
| Login controls | PASS | Email/password/sign-in/forgot-password; no registration control |
| Invalid login/session | PASS | One random nonexistent synthetic identity rejected; invalid bearer rejected |
| Anonymous protected routes | PASS | Seven UI paths require login; four protected APIs reject anonymous requests |
| Responsive overflow | PASS | Landing/login fit all five specified widths; this is not authenticated-layout acceptance |
| JavaScript exceptions | PASS | Zero page exceptions |
| Browser diagnostics | FAIL | 39 console errors, 19 failed requests during repeated navigation; failures are Cloudflare beacon blocked by CSP, plus expected invalid-login HTTP 401 |
| Authenticated login/session/logout | BLOCKED | User identified info@globalhightech.com; secure sign-in handoff still needed |
| Dashboard | BLOCKED | Authenticated live test pending |
| Customers | BLOCKED | Implemented pilot list/detail/edit; live CRUD pending approved synthetic session |
| Quotations / sales workflow | BLOCKED | Implemented list/editor/status flow; live workflow pending |
| Projects | BLOCKED | Implemented list/editor/status/task flow; live workflow pending |
| Tasks / employee task view | BLOCKED | Implemented; role-specific tests pending |
| Team / roles / account settings | BLOCKED | Implemented permission-gated UI; authorized live session required |
| Invoices / inventory / broader finance | NOT TESTED | Not enabled production pilot UI workflows; do not infer implementation from prototype pages |
| Reporting / broader HR | NOT TESTED | Not complete pilot UI modules; no redesign scope expansion |
| Two-tenant isolation | BLOCKED | Only one synthetic tenant observed; second authorized synthetic tenant/account needed |
| Tontin baseline | PASS | Read-only health/identity snapshot recorded; two already stopped services noted above |
| Rollback compatibility | PASS | Migration fingerprint unchanged; retained storage; current release bundle available |
| Fresh real-host restore proof | NOT TESTED | No restoration or rehearsal run in this audit |

Screenshots: `tmp/release-64-review/live-before/landing-1440.png`,
`login-1440.png`, and matching files for the other widths.
Anonymous browser trace: `anonymous-baseline-trace.zip`. Authentication requests
were outside tracing; passwords, tokens and cookies were not exported.
Machine-readable results: `tmp/release-64-review/live-before/report.json`.

No authenticated test, skipped test, or test against a future deployment is called
passed. Post-deployment testing must repeat this baseline, compare target assets,
verify the host's immutable manifest and exercise approved synthetic workflows.

## Exact publication approval boundary

Approve one rerun of run 41083575411, currently attempt 1, for proposed release:

`3b70c8754ff4c04335403d1ff5fe3197d9e2f470-41083575411-2`

Procedure:

1. Recheck exact SHA/run attempt, successful gates, no duplicate bundle/tags, no
   competing eligible run, approval absent, staging=false. Stop if identity changes.
2. Temporarily set repository `OPERIX_SUPPORT_PUBLICATION_APPROVED=true`, rerun
   exactly #64 once with run-specific debug logging to capture package checksum.
3. Monitor until its publication step captures the approval environment; remove
   and verify removal of the temporary variable. Clean up on failure/interruption.
   Do not leave standing approval, dispatch a moving branch, or automatically retry.
4. Let the existing workflow rebuild/test/scan, publish five unique immutable tags,
   retain the two locked support digests, and read back/rescan all seven images.
5. Independently verify every ECR digest and relevant new/retained tag, release.json,
   seven-image manifest, deployment files and migration fingerprint. Download the
   exact versioned S3 bundle and compare its SHA-256 with the workflow's recorded
   output. If output evidence cannot be retrieved, report blocked checksum proof.
6. Verify staging skipped and switches reset. Present the actual release, checksum,
   S3 version, backup readiness, downtime, migration/rollback compatibility and
   remaining risks for separate deployment approval.

This approval includes only CI tests, ECR publication and S3 release upload. It does
not authorize deployment, infrastructure/secrets/DNS changes, or Tontin operations.
Partial publication must not be deployed or silently deleted/retried.

The later deployment request will use the existing fixed SSM release document and
exact verified release/checksum, preserve Cloudflare and data volumes, and document
the Operix API/web maintenance window, fresh pre-migration backup and same-schema
rollback to the currently running release. Deployment-time credential/storage guards
must pass. Critical regression rollback will be limited to that approved procedure.

## Evidence locations

Ignored raw evidence and scripts: `tmp/release-64-review/`, including CI logs/jobs,
ECR/S3 inventories, Cloudflare JSON, read-only SSM parameters/output, rollback audit,
and Playwright screenshots/report/trace. No source or workflow correction was needed
to make this procedure reviewable; the missing step is explicit publication approval.
