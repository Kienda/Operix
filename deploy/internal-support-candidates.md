# Internal supporting candidates — preparation only

These are temporary Operix-maintained PostgreSQL 16.15 and Redis 7.4.11 images.
They are **not published or approved for deployment**. Production Compose, the
fixed release receiver, AWS resources and the main-only publication loop are unchanged.
The production supporting-image gate remains blocking until separate adoption approval.

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
An additional full application smoke uses that overlay on disposable CI data to
verify normal initialization, Prisma migrations, least-privilege roles, health checks,
empty accounts and existing resource/isolation limits. It refuses non-CI candidate
execution. The production receiver never reads this overlay.

Candidate scans are separate from the production scan: `scan_support_images.py
--candidates` requires the actual locally built images and cannot pull a fallback.
No argument continues to scan production references. All scans retain Trivy 0.61.1,
HIGH,CRITICAL and exit-code 1; no ignore rules or unfixed exclusions are introduced.

## Separate publication / IAM proposal — do not apply

Before any adoption, review a fresh exact deployed CloudFormation baseline. A narrow
proposal would add only encrypted, immutable, scan-on-push ECR repositories:

- `arn:aws:ecr:us-east-1:471112967488:repository/operix-postgres`
- `arn:aws:ecr:us-east-1:471112967488:repository/operix-redis`

ImagesRole would receive its existing repository-level push/read actions on exactly
those two ARNs: BatchCheckLayerAvailability, GetDownloadUrlForLayer, BatchGetImage,
InitiateLayerUpload, UploadLayerPart, CompleteLayerUpload and PutImage (all `ecr:`).
InstanceOperixPolicy would receive only BatchCheckLayerAvailability,
GetDownloadUrlForLayer and BatchGetImage on those same two ARNs. Existing
GetAuthorizationToken scope is unchanged; no `ecr:*`, trust, DeployRole, Secrets
Manager, SSM, EC2, networking or Tontin permission changes are proposed.

This would expand publication from five application images to seven total images
and requires explicit approval; no CloudFormation change or AWS write is included.
After approval: implement/review the focused stack update, update the publication
loop and manifest to record all seven immutable ECR digests, then separately approve
production Compose adoption and fresh-volume/recovery identity handling. The existing
recovery wrapper still uses Bookworm/UID999, so candidate adoption must also switch
its pinned image and scratch UID/GID to70 under tested, reviewed changes. Never
silently keep the vulnerable recovery image or reuse its UID assumptions on Alpine.

Only after the published artifacts and production gate pass should a separate
deployment plan be approved. Staging remains disabled and synthetic-data-only on
unencrypted EBS. DNS, tunnel startup, live migrations and all Tontin resources remain
outside this preparation.

Return to official images when same-major upstream releases pass the full final-image
gate and persistence/restore/application compatibility suite. Remove the internal
patches only through a reviewed immutable release; do not follow mutable latest tags.
