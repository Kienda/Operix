# Operix publication approval review — October 21, 2026

Status: awaiting explicit user approval. No merge, variable update, workflow rerun,
image push, artifact upload, EC2 operation or staging action was performed in this
review. Keep `PROXY_MODE=tunnel` unchanged. The earlier loopback-only proposal is
not approved and is not part of this publication scope.

## Identity and current GitHub state

[PR #11](https://github.com/Kienda/Operix/pull/11) was already merged externally
by `Kienda` at 2026-10-22 01:09:31 UTC (October 21, 21:09:31 EDT). This agent did
not merge it. Reviewed PR head:
`3e1bd4bb76466badf8856976249d59bd42836bc3`.
Merge/main commit:
`2d899cb8f3eab63f2b197a7e04e2efb8aa9ff7a5`.
GitHub comparison reports no file differences between the PR head and main; the
only additional commit is the merge commit.

PR run [39689973736](https://github.com/Kienda/Operix/actions/runs/39689973736)
and merged-main run [39704047009](https://github.com/Kienda/Operix/actions/runs/39704047009),
attempt 1, both completed successfully. All three prerequisite jobs `verify`,
`security`, and `images` passed. Publish and staging were skipped. The full checks
include unit/type/build, P0/migrations, pilot/SMTP, authorization QA, browser,
lint/format, deployment/recovery contracts, seven builds/scans, actual-image smoke,
operator recovery implementation and supporting-image persistence/restore tests.

GitHub currently reports main as unprotected, no classic required status checks,
and no PR reviews. Environment protections inspected earlier were branch policies,
without required reviewers. The checked CI results are real, but are not an
assertion that GitHub enforces human review or required checks at merge time.

Publication approval variable remains absent. `OPERIX_STAGING_DEPLOY_ENABLED=false`;
`OPERIX_AWS_ENABLED=true`. No release was published by the merged-main run.

## Exact PR scope

22 files; 500 added lines and 177 removed lines. Changes are publication and safe
support-image consumption/recovery integration, not just a standalone publisher.

| Area | Exact files | Result |
| --- | --- | --- |
| Publication/manifest | `.github/workflows/operix.yml`, `deploy/scripts/release-images.py`, `deploy/scripts/image-manifest.py`, `.gitignore` | Build/test/scan all seven before any push; explicit main/publication gate; immutable release tags; registry digest/config readback and rescans; generate and validate ignored deploy/images.json. |
| Digest consumers | `deploy/compose.yml`, `deploy/compose.tunnel.yml`, `deploy/scripts/load-images.sh` | Require seven validated immutable image references, including the tunnel; safely load only fixed validated export keys. |
| Data continuity | `deploy/scripts/backup.sh`, `deploy/scripts/deploy.sh`, `deploy/scripts/support-storage.py` | Backups use the release lock; record support-image/storage identity; reject unknown existing volumes, changed support digests, missing recorded volumes and incompatible rollback/credentials. |
| Supporting build provenance | `deploy/docker/support.Dockerfile`, `deploy/docker/support/provenance.json` | Update adoption/publication status metadata and labels; do not change pinned build inputs or database majors. |
| Recovery | `deploy/scripts/restore-common.sh`, `deploy/scripts/restore-rehearsal.sh`, `deploy/scripts/rehearse-synthetic-recovery.sh` | Use the locked PostgreSQL recovery image and verified UID/GID 70; disable replay of the completed one-off S3-writing rehearsal. |
| Tests | `deploy/tests/scan_support_images.py`, `deploy/tests/smoke.py`, `deploy/tests/support_candidates_smoke.py`, `deploy/tests/test_deployment.py`, `deploy/tests/test_image_release.py`, `deploy/tests/test_recovery.py` | Test immutable identities, manifest rejection, each scan failure preventing pushes, registry readback, storage continuity and exact operator restore implementation. |
| Documentation | `deploy/internal-support-candidates.md` | Document approved infrastructure prerequisite, gated publication, immutable release/storage contract and separate deployment approval. |

No application/API/frontend source, Prisma migration file, CloudFormation/IAM
configuration, DNS configuration or Tontin file is changed in this PR. Compose
and recovery changes are part of safely consuming the supporting images; they
are not authorization to execute a deployment.

## Proposed single-publication approval

No merge action is left to authorize. Request publication approval only for the
already reviewed merge commit above, by rerunning the completed merged-main
workflow run 39704047009 once. Provided its current attempt remains 1, the proposed
release identity is:

`2d899cb8f3eab63f2b197a7e04e2efb8aa9ff7a5-39704047009-2`

This is proposed, not published. If main SHA, run identity/attempt, workflow source,
CI conclusions or staging/publication switches differ at execution, stop and
reconcile before acting. Do not silently approve a different commit or attempt.

After explicit approval only:

1. Reverify main/source identity, all prerequisite checks, no competing eligible
   main publication run, staging=false and approval-variable absence. Keep tunnel
   mode and host configuration unchanged; do not send any SSM command.
2. Temporarily set repository variable OPERIX_SUPPORT_PUBLICATION_APPROVED=true,
   then rerun the exact existing merged-main run once. This is the existing
   workflow's intended repository-level gate, not an environment variable switch
   or an IAM expansion. Only operix.yml's main/CI-gated publish job consumes it.
3. Enable run-specific diagnostic logging on that rerun to retain the workflow's
   generated release/checksum outputs for independent S3 readback verification.
   GitHub's rerun API supports `enable_debug_logging`; its runner logs file-command
   output values at debug level. This does not create a persistent repository
   debug variable. Treat diagnostic logs as private operational evidence.
4. Remove the temporary approval variable as soon as the approved publication
   step has started with its approval environment captured; verify removal. Also
   attempt removal on failure/interruption. Monitor all main runs and stop/reset
   approval if a competing eligible run appears. Never leave standing publication
   approval or automatically retry a failed attempt.
5. The publisher rebuilds and tests on disposable GitHub runners, including
   synthetic test migrations/containers. These are CI-only. No EC2 migration,
   runtime container startup, host deployment or tunnel activation is authorized.
6. Verify all seven pushes/readbacks/rescans and the complete deploy/images.json;
   verify release.json identity and migration fingerprint against the exact source.
   Download the exact S3 object version, compare its SHA-256 with the workflow's
   recorded checksum output, and record S3 version/encryption/native checksum.
   If the expected checksum is not retrievable from the diagnostic publication
   record, report checksum verification blocked rather than asserting a match.
7. Requery each immutable ECR tag using both tag and manifest digest, compare all
   seven values, ensure publication variable removed and staging=false, and report
   staging job skipped. Do not invoke deploy.sh or the release SSM document.

Official references for the run-specific checksum evidence mechanism:
[GitHub rerun API](https://docs.github.com/en/rest/actions/workflow-runs#re-run-a-workflow)
and [runner output handling](https://github.com/actions/runner/blob/main/src/Runner.Worker/FileCommandManager.cs).
Capturing the checksum in debug output is based on that implementation; if runner
behavior differs, independent expected-SHA verification remains a blocker.

## Remaining risks and limits for approval

- The approval variable is repository-scoped, not cryptographically bound to a
  single run. Main lacks branch protection and environments lack required
  reviewers. An uncontrolled concurrent main change during the temporary window
  could satisfy the same gate. Idle-run checks, continuous monitoring, a pinned
  existing rerun and prompt reset reduce but do not eliminate that governance
  risk. No repository protection or workflow redesign is silently included.
- Seven ECR pushes are not transactional. Network/registry/readback failure can
  leave some immutable tags without an uploaded complete bundle. Do not deploy
  partial publication or delete/overwrite tags automatically; review a new attempt.
- Scan gates remain HIGH/CRITICAL, with no ignore rules or ignore-unfixed flag.
  They do not mean zero vulnerabilities at every severity. Rebuild bases may
  change, so publication repeats its own tests/scans and verifies registry bytes.
- PostgreSQL stays major 16 but uses Alpine/musl/UID70. Existing Bookworm physical
  data cannot be attached. Storage guards require fresh Operix-only storage or a
  separately approved logical migration; publication alone changes no volumes.
- The workflow currently carries the bundle checksum through a job output rather
  than durable S3 user metadata. This plan uses run-specific diagnostic output as
  the expected value, with explicit failure if it is unavailable, not a fabricated
  checksum comparison.
- Staging remains disabled. Its EBS is unencrypted, allowing synthetic data only.
  First deployment retains approved tunnel mode; Cloudflare Access/tester acceptance,
  final headroom/IMDS isolation, fresh-storage and real host backup/restore criteria
  remain separate staging approval gates. Do not change DNS or Tontin.

## Approval requested

Authorize exactly the single publication rerun and temporary gate/reset procedure
above, including disposable CI tests and run-specific checksum diagnostic logging.
Do not authorize staging, EC2 migrations/containers, DNS/host configuration changes,
Tontin maintenance, permanent publication enablement or further automatic attempts.
No actual release identifier/digests/checksum can be certified until this approved
publication finishes and all readback checks pass.
