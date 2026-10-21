# Supporting-image security blocker — October 21, 2026

**NO-GO. No replacement image has passed the required gate.** Do not merge this
as evidence of completed image remediation or deploy any of these candidates.

The renewed AWS login is on profile `default`, not the expired `operix-staging`
profile. STS verifies account 471112967488 and the expected keinda identity;
requests explicitly use us-east-1. Read-only EC2 checks confirm Elastic IP
52.44.225.198 belongs to i-0ea991afd785b72e0. SSM command
6e647b5c-3589-43c4-9b24-28a6c6f87435 found no Operix containers, networks or
volumes; all existing Tontin container IDs/statuses match the previous inventory.

## Official image assessment

All scans use Trivy 0.61.1, vulnerability scanner only, HIGH,CRITICAL and exit-code 1,
without ignored advisories or ignoring unfixed findings. Candidates were pulled and
scanned on the workstation; no database services, volumes or migrations were run.

| Image | Digest prefix | HIGH | CRITICAL | Result |
| --- | --- | ---: | ---: | --- |
| Configured PostgreSQL 16 Bookworm | 0ea6700a3b4f | 95 | 4 | Fail |
| Configured Redis 7.4 Alpine | 858f009f9709 | 2 | 0 | Fail |
| PostgreSQL 16.15 Bookworm | d81f7b516970 | 95 | 4 | Fail |
| PostgreSQL 16.15 Trixie | a902560563d3 | 85 | 2 | Fail |
| PostgreSQL 16.15 Alpine 3.24 | 721873c34ceb | 24 | 1 | Fail |
| Redis 7.4.11 Bookworm | 44960b3100c4 | 57 | 1 | Fail |

The [complete inventory](security/support-images-20261021.json) records immutable
image references, package/advisory findings, installed/fixed versions and source URLs.
Counts are package/advisory findings, not unique CVEs.

The official Docker Hub tag API confirms the explicit PostgreSQL Bookworm and Redis
Bookworm candidates were published October 21. Their publication date does not make
them clean. Redis 7.4.11 Alpine still resolves to the configured digest; its two HIGH
OpenSSL findings require libssl3/libcrypto3 3.3.7-r2, versus installed 3.3.7-r1.
PostgreSQL Alpine still contains a vulnerable Go runtime in its bundled gosu binary.
The Debian variants also contain OS package findings, including unfixed findings.

## CI correction

The earlier five-image scan did not cover Compose's PostgreSQL and Redis images.
The images job now additionally runs `python3 deploy/tests/scan_support_images.py`.
It renders the actual Compose references without reading runtime secrets, pulls and
archives each image, and scans both with the same threshold. Pull/save/scanner failure
fails the job; failure on the first image does not skip the second. The scanner image
is digest-pinned. Existing five-image scans, audit gates and deployment guards remain.
Mocked regression tests verify threshold enforcement and all three failure paths.

## Compatibility and next decision

Deployment references, volume names/mount paths, credentials, initialization SQL,
database roles, migration files and no-recreate safeguards are unchanged. A failing
newer candidate was deliberately not substituted for the current image. No database
major upgrade, libc/base switch, reset, reindex or storage conversion was performed.
[PostgreSQL's minor-release compatibility guarantee](https://www.postgresql.org/docs/16/upgrading.html)
does not eliminate OS locale/collation and UID differences between image variants.

The remaining choices require a separately reviewed solution: wait for clean official
compatible images, or expand scope to verified internally patched supporting images
with reproducible source/package provenance, final-image scans, disposable persistence/
restore compatibility tests and an approved publication/IAM plan. Do not change
database majors or add AWS repositories/permissions as an automatic workaround.
No such expanded image build or AWS change is included here.

PR checks must be reported from the latest head. The new supporting-image gate is
expected to fail until actual remediation is supplied; the earlier green Phase 3C
run does not certify the broader gate. Deployment remains disabled. DNS, Nginx,
CloudFormation, IAM, EC2 services and Tontin were not changed. Authenticated Access
acceptance remains deferred until the intended Operix route is active.
