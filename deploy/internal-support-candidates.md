# Internal supporting candidates — preparation only

These are temporary Operix-maintained PostgreSQL 16.15 and Redis 7.4.11 images.
They are **not published or approved for deployment**. The
fixed release receiver remains installed unchanged. The separately approved
CloudFormation update is complete; this PR prepares adoption/publication code only.
Compose now requires immutable image references from the validated seven-image manifest.
No ECR digest is invented before publication. CI tests the exact local content IDs;
publication records registry-returned manifest digests and verifies them by pull/scan.

## Verified inputs and minimal changes

[Provenance](docker/support/provenance.json) records every external digest/checksum,
source identity and dependency checksum. [Dockerfile](docker/support.Dockerfile):

- PostgreSQL uses official 16.15 Alpine 3.24 by immutable digest. Its gosu 1.19
  binary is rebuilt from official tianon/gosu commit
  `6456aaa0f3c854d199d0f037f068eb97515b7513`, verified against the official tag via
  HTTPS GitHub API and git ls-remote. The lightweight tag is unsigned; do not claim
  signed source authentication. The archive is SHA256-pinned. Source and Go module
  versions are unchanged, verified against vendored checksums and Go's checksum
  database. A pinned Go 1.27.3 compiler replaces the vulnerable Go 1.24.6 runtime.
  Binary symbols/build metadata remain available to vulnerability scanners.
- Redis retains its official 7.4.11 Alpine 3.21 digest and server binary, entrypoint,
  UID/GID and persistence layout. Only libcrypto3/libssl3 change from 3.3.7-r1 to
  3.3.7-r2. Official amd64/arm64 APKs are SHA256-pinned and signature-verified using
  the pinned base's Alpine keys. Installation runs with networking disabled and
  confirms the entire package inventory changes only in those two versions.

Fixed build inputs/Go flags support reproducibility. BuildKit provenance-attestation
timestamps may change the outer image index digest; do not claim bit-identical
attestations or treat a local config ID as a published ECR digest.

## Compatibility and limits

PostgreSQL remains major 16 and keeps `/var/lib/postgresql/data`. Alpine uses musl,
different locale/collation behavior, and upstream UID/GID 70 instead of Bookworm's
999. GID 999 is Alpine's ping group and must not be reassigned to PostgreSQL.
**Never physically attach an existing Bookworm database directory to this image.**
First staging currently has no Operix volumes; adoption can use a fresh empty volume.
Existing databases require a separately approved logical restore into a new volume,
index/collation/application acceptance and retained original volumes. This preparation
does not approve an in-place libc/UID change, reindex or volume deletion.

`support_candidates_smoke.py` creates only uniquely labeled synthetic scratch volumes
and containers on a local engine, network none, no ports, max one database running,
512 MiB/0.5 CPU each. It checks Bookworm logical dump -> fresh candidate restore with
Unicode/decimal rows, candidate-generated dump/restore, PostgreSQL restart persistence,
Redis old-image -> candidate same-volume continuity, authentication/AOF and restart.
Cleanup removes only recorded container IDs and ownership-verified scratch volumes.
No application migrations or AWS writes occur in this workstation suite.

The CI-only `compose.support-candidate.yml` overlay changes exactly two image references.
The full application smoke resolves the built images to immutable local content IDs on disposable CI data to
verify normal initialization, Prisma migrations, least-privilege roles, health checks,
empty accounts and existing resource/isolation limits. It refuses non-CI candidate
execution. The production receiver never reads this overlay.

Candidate scans are separate from the production scan: `scan_support_images.py
--candidates` requires the actual locally built images and cannot pull a fallback.
No argument continues to scan production references. All scans retain Trivy 0.61.1,
HIGH,CRITICAL and exit-code 1; no ignore rules or unfixed exclusions are introduced.

## Approved infrastructure prerequisite; publication remains blocked

The separately approved CloudFormation change set
`operix-support-review-20261021222548` completed UPDATE_COMPLETE. It added
`operix-postgres`/`operix-redis` repositories and extended only existing repository
Resource lists for ImagesRole push/read and InstanceOperixPolicy pull. No replacement,
new IAM actions, trust changes or publication occurred. Both repositories are empty,
AES256-encrypted, immutable, scan-on-push and have the approved lifecycle policy.
This PR makes no CloudFormation changes.

## Immutable release and storage contract

`release-images.py` builds all seven from reviewed source, then requires all seven
HIGH/CRITICAL scans before the first push. It repeats disposable restore/application/
tunnel checks in the publication job. Existing verify/security/images jobs must all
succeed. Publication additionally requires main, the existing operix-images environment,
AWS enablement and a separate `OPERIX_SUPPORT_PUBLICATION_APPROVED=true` switch.
This switch has not been enabled. No PR event can publish.

Using existing BatchGetImage permission, publication checks that every unique
commit/run/attempt tag is absent, pushes, reads back the registry digests, then pulls
and scans every published digest. Failure prevents release artifact upload (partial
immutable images can remain after a failed push/readback and require operator review;
never overwrite/reuse a failed release tag). No additional IAM permission is needed.

`deploy/images.json` is generated only by approved publication and included in the
SHA256-checked release archive. Its validator requires exactly seven matching
repository/account/region digest references and release identity. Compose uses these
references for every service; missing manifest or mutable tags fail closed.
`release.json` stays compatible with the installed receiver's exact identity contract.
No fabricated ECR reference or local image ID is shipped as a deployment lock.

The storage guard runs before deployment side effects. Unknown existing Operix
volumes require a separate logical-restore review; missing recorded volumes or changed
supporting digests fail closed. Fresh initialization records both supporting identities.
Neither later releases nor rollback silently switch PostgreSQL/Redis images. Automatic
application rollback also requires equal migration fingerprints, database/Redis credential
fingerprints and matching approved support identities. Legacy releases lacking the
manifest require manual compatibility review, not automatic rollback. Existing volumes
and Tontin are never deleted or attached by these tests.

The restore wrapper now loads the validated release PostgreSQL digest, checks UID70,
and uses UID/GID70 scratch tmpfs. Its actual restore/cleanup path is exercised in CI
using the candidate-generated synthetic dump, in addition to fault-injection tests.
Operator-assisted restore can use a checksum-verified release directory supplied as
`OPERIX_RECOVERY_RELEASE_DIR`; no new S3 read permission is granted to EC2.
The completed one-off Phase3B S3-writing rehearsal is retired to prevent accidental replay.

## Next approval and remaining risks

After all PR checks pass, approve merge and publication separately. Keep staging false.
Then permit only the main publication workflow, capture all seven immutable ECR digests,
verify scans/manifest/archive checksum, and turn the publication switch off again.
Publication approval does not authorize EC2 changes, live migrations, containers, backup
timer installation, DNS, connector startup, Tontin changes or staging enablement.
Unencrypted EBS permits synthetic data only. First deployment has no prior Operix
application release to roll back to; failure leaves Operix stopped with its backup and
original data retained, requiring operator review.

Internal images require ongoing patch maintenance; gosu's upstream tag is unsigned.
AMD64 is the staging target. ARM64 builds/scans passed previously, but full application
and persistence acceptance is AMD64-only. Return to official same-major images only
after clean final-image scans and full compatibility tests under a reviewed storage/image
change; never select a mutable latest tag.
