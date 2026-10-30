> Current instruction: retain approved PROXY_MODE=tunnel. No loopback configuration change is approved. See [final publication approval review](publication-approval-review-20261021.md) for current merge/CI state and the pending publication approval.

# Operix read-only release verification — October 21, 2026

Status: HOLD — complete verified seven-image publication is required before staging.
This report supersedes the unresolved-access and old-source blockers in
`restricted-staging-readiness-20261021.md`. No publication, merge, infrastructure
update, migration, container deployment, tunnel activation, DNS change or Tontin
modification was performed.

## Authenticated live baseline

Official AWS browser login completed for profile `operix-staging`. STS confirmed
account `471112967488`, principal `arn:aws:iam::471112967488:user/keinda`, region
`us-east-1`. Stack `operix-staging` is `UPDATE_COMPLETE`.

- Artifact bucket: `operix-staging-artifactsbucket-obon06ybaj08`.
- Backup bucket: `operix-staging-backupsbucket-urxntjv3dvse`.
- Registry: `471112967488.dkr.ecr.us-east-1.amazonaws.com`.
- Instance: `i-0ea991afd785b72e0`, SSM Online, running `t3.large`.
- All seven ECR repositories exist, are immutable, AES256 encrypted and scan-on-push.
  The live processed CloudFormation template contains the exact seven-repository
  publisher push/read scope and instance pull-only scope. Those earlier ECR/IAM
  prerequisites are resolved; no AWS update was made during this verification.
- Host receiver SHA-256 is
  `83198ef0a41897535981a06e49fe13ad1cc386408377d7946e9e5d3d81fdb3a3`, matching
  the current reviewed local receiver. Host approval sentinel and staging.env exist,
  but no Operix current release, containers, networks or volumes were observed.
- Host environment currently selects `PROXY_MODE=tunnel`, loopback port `18080`,
  and `https://operix.globalhightech.com`. It was read selectively, not sourced or
  changed. No runtime secret values were requested.
- Snapshot: 6911 MiB available RAM, 83 GiB free disk, load 0.02/0.05/0.01. Recent
  CPU averages were approximately 2.3–2.5%, T3 credit balance 864. These pass the
  documented minimum snapshot checks, not sustained concurrent-load acceptance.
- Root EBS `vol-0f2b16ec574deede2` is gp3, 100 GiB, **unencrypted**. Only synthetic
  staging data is eligible while that condition remains. IMDSv2 is required with
  hop limit 2; the reviewed Operix-specific IMDS restrictions remain deployment
  acceptance checks, not evidence that existing Tontin traffic was changed.

## Current source and verified CI

Reviewed current source: `3e1bd4bb76466badf8856976249d59bd42836bc3`, open
[PR #11](https://github.com/Kienda/Operix/pull/11), not merged, mergeable/clean.

[Run 39689973736](https://github.com/Kienda/Operix/actions/runs/39689973736),
attempt 1, succeeded for that exact head. Job/step inspection confirms:

- verify: build, type/unit, P0/migration, pilot/SMTP, authorization/workflow QA,
  frontend/translations, real browser, deployment contracts/shell, lint/format all pass;
- security: frontend/backend HIGH-threshold audits pass;
- images: all release builds, actual application/migration smoke, release scans,
  PostgreSQL/Redis gate, real synthetic restore/persistence, CI-only candidate
  application/migration integration and candidate scans pass;
- publish and staging: **skipped**, as expected for a PR. There are no Actions
  artifacts for this run. This green run is not publication evidence.

The current source includes seven-image `deploy/images.json` validation, immutable
ECR references, registry-vs-tested-content verification, Alpine recovery UID/GID 70,
and storage identity guards. Earlier findings about absent manifest support and
UID/GID 999 describe older source and are resolved in this reviewed PR.

Repository `OPERIX_AWS_ENABLED=true`; `OPERIX_STAGING_DEPLOY_ENABLED=false`.
`OPERIX_SUPPORT_PUBLICATION_APPROVED` is absent at repository level and in the
operix-images/operix-staging environments. Both environments have branch policies
but no required-reviewer rule. Switches and an existing host sentinel do not
constitute fresh release-specific human approval. Record explicit authorization
and the approval method before any operator enables publication or deployment.

## Published release reconciliation

Listing the exact stack-owned `operix/releases/` prefix found one bundle:

`1696ac8293e6994f038666684c6fd23f3cb8ef98-39500102063-1.tar.gz`

- S3 version: `A4YcNIpGtL1BNWe8mumI7sSI_PMGuaI7`.
- Size: 56,463 bytes; server-side AES256 encryption.
- Locally computed downloaded bundle SHA-256:
  `aad29b727f0fcb57cc3e9ab9ea92cfcfe58040f39c48650dc4affce5b30cb123`.
- release.json matches commit `1696ac8293e6994f038666684c6fd23f3cb8ef98` and
  [successful main publication run 39500102063](https://github.com/Kienda/Operix/actions/runs/39500102063),
  attempt 1. Its publish job succeeded; staging was skipped; no Actions artifacts.
- The old bundle contains release.json and migrations.sha256 but **no
  deploy/images.json**. Its two inspected deployment/receiver scripts match the
  exact old GitHub commit. The computed bundle SHA was not independently visible
  in publication logs or S3 user metadata, so it is not claimed as a separately
  authenticated expected publication checksum.
- All five old release-tag ECR digests below match the old successful publish job
  logs. They are evidence for that old release, not a fabricated seven-image lock.

| Repository | Old published release digest |
| --- | --- |
| operix-api | sha256:047d4e92d41773b72d211f317ec236b4893b850d375f074035893ba53f57d641 |
| operix-worker | sha256:210d52d6cc86df52c5a5e3186dfa6f443d3e1f8971a81939ce4a489a93cc091d |
| operix-migrate | sha256:65adfb991b5e061b4b75be28974d2d6315c3f81954fab2d30b38a0093dbc2266 |
| operix-web | sha256:da12edbf4bf2a5d5d5a3bbef2abaf3a5d111a8fad91d62155ff8a1c725cdbe25 |
| operix-tunnel | sha256:ad2233fdd585ab804bd6a8ed735a17e3d49cd6251bcba85cb3e98ba2a4214eca |
| operix-postgres | No published images exist |
| operix-redis | No published images exist |

There is **no complete verified published seven-image release manifest** in the
approved prefix. Publication is required. Do not deploy the old bundle, infer
missing digests from local candidates, or bypass main-only publication.

## Exact remaining gates

1. Explicit approval to merge PR #11 and permit supporting-image publication.
   No merge, approval-variable update, workflow dispatch or push was performed.
2. A successful approved main publication must build/test/scan and publish all seven
   images, verify registry content, and upload the complete checksum-bound bundle
   with deploy/images.json. Then read it back, reconcile its source/run identity,
   expected publication SHA-256, migration checksum and all seven ECR digest refs.
3. Explicit first-staging approval must name that exact release/digest inventory,
   synthetic-data-only scope, resource/health/backup/rollback criteria and access
   method. Keep the staging switch false until approval is recorded.
4. Access scope must be reconciled: the host is currently in tunnel mode, which
   automatically starts a connector after health checks. The proposed DNS-preserving
   first rehearsal uses the existing host branch with loopback-only SSM access and
   no host proxy installation. That requires a separately approved staging.env
   change; it was not applied. Otherwise obtain explicit route/Access activation
   approval. Do not touch Tontin's proxy or existing DNS.
5. At approved execution, reconfirm headroom/resource isolation, fresh Operix-only
   storage, scoped IMDS rules, health, backup receipt and real restore acceptance.
   Public HTTPS/email invitation/Access acceptance is deferred for a loopback-only
   first stage. Unencrypted EBS prohibits real production data, rather than
   authorizing an encryption migration in this workstream.

Tontin's live script and crontab hashes were unchanged across all read-only checks;
its existing containers, ports, networks, volumes and DNS were not modified.
Tontin installation/manual export/real restore approval remains a separate task
in `F:/Projects/Tontin/infrastructure/ops/backup-db.md`.
