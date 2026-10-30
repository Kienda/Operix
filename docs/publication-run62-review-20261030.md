# Operix run #62 publication review — October 30, 2026

Status: ready for a single publication approval. No variable, workflow run, ECR object,
S3 object, host, Cloudflare configuration, database, secret, DNS or Tontin service was changed.

## Exact source and run

- Run: https://github.com/Kienda/Operix/actions/runs/40994366612
- Workflow number 62, attempt 1; event `workflow_dispatch`; branch `main`.
- Commit: `1f312508b8b4c2c8e9cb506268bc125ed26c0907`.
- Live main still points to that commit. No active release workflow appeared in the
  current 30-run listing.
- The workflow has no dispatch inputs. It also accepts pushes to main and PRs;
  publication excludes PR events and requires `refs/heads/main`.

## Publication gate and evaluation evidence

The job requires all of:

```text
success()
needs.verify.result == 'success'
needs.security.result == 'success'
needs.images.result == 'success'
github.ref == 'refs/heads/main'
github.event_name != 'pull_request'
vars.OPERIX_AWS_ENABLED == 'true'
vars.OPERIX_SUPPORT_PUBLICATION_APPROVED == 'true'
```

GitHub's jobs API and check-suite API record verify, security and images as successful,
and publish/staging as skipped. Publish has zero steps. Its check output has no summary,
text or annotations. Requesting its job logs returns 404/BlobNotFound. The successful
jobs' downloaded logs contain no server-side trace of the skipped job's expression.
Therefore an original expanded expression or historical variable snapshot is unavailable;
this review does not claim to have retrieved one.

Current authenticated repository-variable listing contains exactly:
`OPERIX_AWS_ENABLED=true` and `OPERIX_STAGING_DEPLOY_ENABLED=false`.
Direct GET for `OPERIX_SUPPORT_PUBLICATION_APPROVED` returns 404. Both environment
variable listings also lack it. The repository is owned by the user Kienda, not an
organization. The missing approval switch is the unmet condition in the current
configuration; the event, branch and dependencies all satisfy their conditions.

Both environments restrict deployment branches to main. Their single protection rule
is a branch policy; neither has a required-reviewer rule. Main is unprotected. Existing
environments are not missing. Environment-level variables should not be used to supply
this job-level approval condition; the existing procedure uses repository scope.

## Redesign and security

GitHub confirms PR #19, `Feat/operix brand identity`, merged as
`bf7dc4d0a2f1ec30c39840e77938b8f2c82a6987`. That merge is an ancestor of the target.
There are no differences between that merge and the target under `src`, `public`, or
`index.html`. The branded landing page, authentication screens, dashboard styling,
wordmarks, icons and fonts are included. The web Dockerfile copies those sources and
sets `VITE_OPERIX_EXPERIENCE=pilot` before building; the redesign is in the deployed
entry path, not only the optional prototype.

Run #62 logs and individual step outcomes confirm:

| Gate | Result |
| --- | --- |
| Seven image builds: api, worker, migrate, web, tunnel, postgres, redis | Passed |
| Seven release image HIGH/CRITICAL scans | Passed; reported scanned targets have zero threshold findings |
| Compose-selected supporting image scans | Passed for CI content IDs |
| Internal PostgreSQL/Redis candidate scans | Passed |
| Actual-image migrations, readiness and tunnel smoke | Passed |
| Supporting restore, persistence and application compatibility | Passed |
| Frontend npm audit | Zero vulnerabilities |
| Backend pnpm audit | Passed HIGH threshold; 3 low and 8 moderate remain |
| Verify/build/type/unit/integration/browser/deployment contracts | Passed |

Scans use fail-on-HIGH/CRITICAL, exit code 1, and no ignore-unfixed option. Scanner
warnings about vendor severities and Alpine EOL-list coverage remain in the logs.
Passing thresholds are not a claim of zero vulnerabilities at every severity.

Publication uses `publish --retain-support`: five application images receive new tags;
the seven-image manifest retains the approved PostgreSQL and Redis digests. ECR
currently maps their recorded source release to exactly the lock's digests:

- PostgreSQL: `sha256:33341234955a890b4832395d16100bcc1bfd0812a38012e8d81b7404bc6eddf9`
- Redis: `sha256:6aa8592b54375bb6c6a1f9f5030d62ce2349f51a59ca4a7dfe7df1da7bf571d5`
- Source release: `2d899cb8f3eab63f2b197a7e04e2efb8aa9ff7a5-39704047009-2`.

All seven canonical support build-input checksums at the target match the lock, and
the publisher's retained-support validator passes. Run #62's CI-selected supporting
content IDs are freshly built candidates, not proof of a fresh scan of these retained
registry bytes. The existing publisher explicitly pulls, tests and scans the retained
digests before any new push, then reads back and rescans all seven selected images.
Those publication-time checks must pass before certifying the final release.

## Duplicate check

Authenticated AWS identity: account `471112967488`, user `keinda`, region us-east-1.
Complete describe-images results for all seven repositories show no tag beginning with
the target full commit SHA. S3 ListObjectsV2 for
`operix/releases/1f312508b8b4c2c8e9cb506268bc125ed26c0907` returns no objects.
There is no existing tagged release/bundle for this commit to reuse. Untagged blobs
cannot be certified as a release for this commit.

## Single-attempt publication procedure — pending user approval

Proposed immutable release, provided run #62 remains at attempt 1:

`1f312508b8b4c2c8e9cb506268bc125ed26c0907-40994366612-2`

1. Recheck source/run identity, approval absence, staging=false, no competing eligible
   release run, and no matching existing release. Stop if identities change.
2. Temporarily set repository variable `OPERIX_SUPPORT_PUBLICATION_APPROVED=true`.
3. Rerun the exact existing run 40994366612 once, with run-specific debug logging to
   retain package output checksum evidence. Do not dispatch a moving main revision.
   Rerunning all jobs preserves verify/security/images gates without modifying code.
4. Monitor the approved run and competing main runs. Remove the temporary variable
   once the approved publication step starts with its approval environment captured;
   verify removal. Attempt cleanup on failure/interruption as well. Do not automatically
   retry. This repository-scoped window is not cryptographically bound to one run;
   existing branch/reviewer protections do not eliminate that concurrency risk.
5. Require the existing publisher's rebuilds, smoke tests, candidate and retained-image
   scans, five immutable pushes, seven digest readbacks and rescans to pass.
6. Retrieve the workflow's release/checksum outputs. Download the exact uploaded S3
   object version; compare SHA-256 against the independently recorded workflow output,
   and record S3 version, encryption and native checksum where available. An ETag alone
   is not the expected SHA-256. If the workflow output is unavailable, report that
   verification blocked rather than asserting a checksum match.
7. Validate release.json commit/release, deploy/images.json schema and all seven immutable
   references, storage contract, source deployment files and migration fingerprint.
   Query every ECR manifest by digest and compare to the bundle; query five new tags
   and both retained source tags as well. Record digests, checksum and S3 object version.
8. Verify staging was skipped, approval variable removed, and staging switch still false.

This authorizes publication only after the user's explicit approval. It includes
disposable GitHub-runner tests, ECR pushes and the S3 release upload. It does not
authorize infrastructure changes or runtime deployment. Partial immutable publication
must be reported; no automatic tag deletion, overwrite or retry is included.

## Separate deployment request after verified publication

Prepare approval for the exact verified release ID and checksum, fixed existing SSM
release document, exact existing Operix instance/path, and the existing deployment
scripts only. Before requesting it, perform read-only host preflight to identify the
current release/checksum, database storage identity, migration fingerprint, backups,
health, headroom and rollback compatibility. Do not infer current host state from
older reports. Record the rollback target and practical database rollback limitations.

Preserve Cloudflare tunnel/Access configuration and DNS, retained PostgreSQL/Redis
digests and volumes, current secrets, Tontin services and proxy. The worker remains
disabled. Any required database migrations and Operix restart/downtime must be listed
in that separate request. No deployment or SSM command was sent in this review.

Raw run/jobs/logs, variable and ECR/S3 evidence is saved locally under ignored
`tmp/release-62-review/`. No application or workflow code was changed.
