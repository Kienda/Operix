# Operix restricted AWS staging

Status: implementation prepared for review; **not deployed and not production-ready**.
Target: existing Ubuntu EC2, us-east-1, Elastic IP `52.44.225.198`, absolute directory
`/opt/ght/apps/operix`. Tontin shares the host and must retain its resources and proxy configuration.
Nothing here changes AWS, GitHub settings, DNS, the existing proxy or Tontin by itself.

## What is deployed

`compose.yml` defines project `operix-staging`, with project-prefixed networks and volumes:

| Service | Access | Budget |
| --- | --- | --- |
| web | dedicated ingress bridge and host loopback `127.0.0.1:18080`; optional new edge network | 128 MiB / 0.25 CPU |
| api | internal port 4000; application, data and outbound SMTP network | 768 MiB / 0.75 CPU |
| postgres | data network only; persistent Operix-only volume | 1 GiB / 0.75 CPU |
| redis | queue network only; authentication, AOF, no eviction | 256 MiB / 0.25 CPU |
| migrate | one-shot release profile, no seed command | 512 MiB / 0.5 CPU |
| worker | **disabled** profile, built and scanned only | 256 MiB / 0.25 CPU |

Running application limits total about 2.125 GiB / 2 vCPUs. Migration runs while Operix API/web are stopped.
These limits do not prove adequate headroom for Tontin. Inspect real host usage, Docker disk use and burst
CPU credits before approval. The script requires 2 GiB available memory and 10 GiB free disk; load tests,
disk alarms, backup retention and a recovery drill remain release gates. Docker alone is not a security
boundary against a malicious host/root operator. Do not mount the Docker socket into application containers.

The API uses `operix_app` (no superuser, role creation, database creation or BYPASSRLS). Migrations use
`operix_migrator`, the database/schema owner. `operix_admin` is reserved for database initialization/backups.
This does **not** claim database row-level tenant policies exist: tenant isolation is currently enforced by
the application's policy/scoped queries and tested composite constraints. PostgreSQL 16 is sufficient for
the current Prisma migrations; no current schema uses PostGIS. The development init SQL (including its
default password) is intentionally not mounted. A future PostGIS feature needs a separately reviewed upgrade.

The worker currently marks notification records delivered without a provider call, and export/render jobs
return placeholders. There are no functional API queue producers. It must remain disabled until real delivery,
retry/idempotency tests and a job-readiness check exist. Its included health check tests Redis connectivity
only, not completion of real jobs. API mail uses its SMTP service directly and does not require this worker.

## Files

- `docker/backend.Dockerfile`: separate API, worker and migration targets; Node 24, pnpm 11.1.3, Linux Prisma
  generation; distroless non-root runtime (no shell: operator commands call `node` directly).
- `docker/web.Dockerfile`: locked npm build of the **staff pilot**, unprivileged Nginx, same-origin `/api/v1`.
- `docker/runtime-env.cjs`: reads only the mounted service secret file; no secrets baked into image layers or Vite arguments.
- `aws/operix-staging.template.json`: reviewable ECR/S3/OIDC/IAM/SSM resources; **do not apply without approval**.
- `scripts/receive-release.sh`: fixed host bootstrap; downloads/checks/extracts only a reviewed deployment bundle.
- `scripts/deploy.sh`: serial release, backup, migrate deploy, readiness, compatibility-limited rollback.
- `.github/workflows/operix.yml`: full checks, Linux image build/smoke/scan, ECR publication and restricted staging via SSM.

## Blockers before enabling AWS jobs

1. ~~Resolve the findings recorded in [verification](verification.md)~~ — resolved October 18: 0 registry
   advisories, QA/browser/format gates pass, 0 HIGH/CRITICAL image findings. Still open: lint executes zero
   tasks and is not meaningful lint coverage. Do not bypass failed checks. Current verdict and remaining
   gates: [readiness report](../docs/pilot/READINESS_REPORT.md).
2. Obtain the account ID and exact EC2 instance ID/instance role. Confirm SSM Agent is online and sufficiently
   recent for ENV_VAR document interpolation. No SSH keys are required by CI. No AWS credentials belong in GitHub secrets.
3. Inspect the current shared Nginx placement, includes, certificate paths, occupied ports, Docker networks,
   firewall and security groups **read-only first**. Choose host or Docker-edge mode. Never assume a Tontin private network is reusable.
4. Review the infrastructure template, dedicated secret/KMS setup, SMTP sender/provider credentials and TLS
   delivery. API production startup requires `MAIL_DRIVER=smtp`; a log driver cannot stand in for delivery.
5. Configure main-branch protection and approval-protected GitHub environments. For this **private repository**,
   required reviewer availability depends on the GitHub plan. If required reviewers are unavailable, keep automated
   deployment disabled and use an independently approved operator-controlled SSM invocation. Repository variables
   alone are switches, not an approval system.
6. Approve the precise host bootstrap, resources, new Nginx blocks, DNS and restricted tester CIDRs. No real staff
   or authoritative business data until the release gates in the system audit and `verification.md` pass.

## GitHub configuration

Protect `main`: PR review, no direct/force pushes, required `verify`, `security`, `images` checks, restricted
workflow changes and no untrusted runner. Do not change triggers to `pull_request_target` or execute PR code with AWS credentials.
Create environments `operix-images` and `operix-staging`, restrict both to `main`, require independent reviewers,
prevent self-review and admin bypass where supported. Protect repository/environment variables and the OIDC roles.

Variables (not application secrets):

| Variable | Purpose |
| --- | --- |
| `AWS_ACCOUNT_ID` | exact 12-digit account; validated by AWS credentials action |
| `OPERIX_ECR_ROLE_ARN` | ImagesRoleArn output, trusted only by `repo:Kienda/Operix:environment:operix-images` |
| `OPERIX_DEPLOY_ROLE_ARN` | DeployRoleArn output, trusted only by `repo:Kienda/Operix:environment:operix-staging` |
| `OPERIX_ARTIFACT_BUCKET` | dedicated ArtifactsBucket output |
| `OPERIX_INSTANCE_ID` | exact approved instance ID, **not** `52.44.225.198` |
| `OPERIX_AWS_ENABLED` | leave unset/false until publication is approved |
| `OPERIX_STAGING_DEPLOY_ENABLED` | leave unset/false until host staging deployment is approved |

All credentialed jobs follow successful test/security/image gates. Scanners receive read-only exported image
archives; they never receive the Docker socket or application secrets. Images use unique immutable tags
`<40-character-commit>-<run-id>-<attempt>`, OCI revision labels, ECR tag immutability and scan-on-push.
Re-runs produce new tags. Image scan gates reject high/critical advisories. Actions are pinned to verified
commit IDs. Dependabot watches action and Docker references. Base image tags are major/minor aliases and
may move: capture the actual resolved base digests from build logs, review updates and pin those digests for
formal production promotion. The migration image intentionally includes Prisma CLI/build dependencies and
is scanned too. The API/worker use pnpm's isolated production deployment output.

## AWS permissions and resource review

The template is in **us-east-1**. It expects an existing GitHub OIDC provider ARN, existing EC2 instance role,
dedicated runtime secret ARN and its KMS key ARN. It creates four Operix-only ECR repositories, private
versioned artifact/backup buckets, two OIDC roles, a fixed `Operix-Staging-Release` SSM document, and an
additive Operix policy on the supplied instance role. It creates no EC2/DNS/proxy resources. Applying the
template would change AWS resources and the shared instance role, so it needs explicit approval first.

- Publisher: upload image layers/PutImage to the four repositories, ECR auth, PutObject under
  `operix/releases/` in the artifact bucket only. No secret reads, EC2 or SSM commands.
- Deployer: SendCommand against only the exact instance ARN and fixed document ARN; GetCommandInvocation
  requires `Resource: '*'`. No generic AWS-RunShellScript, S3 uploads or secret reads.
- Instance: ECR pull, GetObject under the artifact prefix, encrypted PutObject under backup prefix,
  GetSecretValue for the dedicated secret, KMS decrypt only via Secrets Manager. Retain its existing SSM
  management permissions; do not replace its role/profile or disturb permissions needed by Tontin.
- The KMS key policy must separately permit the approved instance role. No wildcard Secrets Manager access.
- No static AWS keys, GitHub PAT or repository clone credentials on the host. SSM receives identifiers/hash
  only, never passwords or command text. Agent versions without ENV_VAR support fail closed.
- SSM has root power. Protect document updates and workflow trust as privileged code changes. The receiver
  script is installed by an operator and never self-updated. Review its diff before installing a new version.

Retain tagged ECR images and old releases for rollback; the template expires only untagged layers. Buckets
and repositories are retained on stack deletion. Define approved retention and cost limits without deleting
the active/previous image or only recoverable backup. Configure CloudWatch collection of container JSON logs,
SSM failures, readiness, disk/memory and CPU-credit alarms before staff access; log rotation here is local,
not a claim that central monitoring is installed. Prevent containers from reaching instance metadata with an
approved host/IMDS configuration; do not grant application containers access to the shared instance role.

## Secret material

Create one dedicated Secrets Manager secret with the exact JSON keys in `secrets.example.json`. Generate
each database/Redis/JWT value separately (`openssl rand -hex 48`); never use the example strings. No demo
email/password is required. SMTP credentials come from the approved provider. Do not log the JSON or paste
it into GitHub variables/SSM command arguments. Use an encrypted local file and an approved secret-creation
procedure; do not type secrets as shell command-line flags. Delete that local input securely after verification.

The host retrieves the secret with its role. Each release stores service-specific files under `runtime/` in
a root-only directory; Compose bind-mounts just the required files into each container. File mode 0444 lets
the non-root container UID read its own bind mount; the containing host directory is 0700. API receives only
its database URL/JWT/SMTP credentials; it never receives migration/admin passwords. Compose secrets on a
single host are **not** an encrypted secret store: require encrypted EBS, restricted root/backup access and
encrypted, versioned S3 backups. No secret is put in Compose environment output.

Database/Redis password changes are detected and rejected by the release script. Changing a Secrets Manager
value alone cannot rotate passwords in an existing PostgreSQL/Redis volume. Use a separately reviewed role
rotation procedure and coordinate rollback credentials. JWT rotation invalidates sessions; old release secret
files persist for rollback, so review compromise/rotation handling before choosing a prior release.

## Host preparation — run only after approval

The pasted prompt `~/opt/ght/apps/operix` is under the Ubuntu user's home. It is different from the requested
absolute path. Verify without creating or moving anything:

```bash
pwd
ls -ld /opt/ght/apps/operix
readlink -f /opt/ght/apps/operix
docker ps --format '{{.Names}} {{.Ports}}'
docker network ls
free -h
df -h /opt
sudo nginx -T  # if Nginx runs on host; keep any sensitive output private
```

After approval, install Ubuntu Docker Engine/Compose v2.24+ (or current compatible v5), AWS CLI v2,
Python 3.12+, curl and util-linux/flock; do not upgrade or restart the shared daemon without its own review.
Require outbound HTTPS to ECR/S3/Secrets Manager/SSM and SMTP TLS to the approved provider. Check the existing
host profile/SSM agent before making changes. No application build occurs on this 8 GiB instance.

```bash
sudo install -d -m 0700 /etc/operix /opt/ght/apps/operix/releases /opt/ght/apps/operix/backups
sudo install -d -m 0755 /usr/local/libexec
sudo install -m 0755 deploy/scripts/receive-release.sh /usr/local/libexec/operix-receive-release
sudo install -m 0600 deploy/host.env.example /etc/operix/staging.env
# Edit staging.env identifiers/SMTP details with sudoedit; do not source an unreviewed file.
# Create the following approval sentinel ONLY after restricted staging is approved:
sudo install -m 0600 /dev/null /etc/operix/staging.approved
```

All deployment paths/approval files/bootstrap must be root-owned, not writable by application or CI users.
The release runs as root via SSM; Docker access itself is root-equivalent. Verify EBS encryption and reserve
host resources before enabling either GitHub switch.

## Routing while preserving Tontin

Default: host Nginx proxies the two new hosts to **only** `127.0.0.1:18080`. Both hosts pass through the Operix
gateway; NestJS port 4000 never binds to the host. Browser API calls remain same-origin `/api/v1`; the API
hostname is prepared for external clients. Production CORS permits only the frontend origin.

Use `nginx/operix-edge.conf.example` as **new** server blocks and a separate
`/etc/nginx/snippets/operix-staging-access.conf`. The access snippet initially denies everyone. Insert only
approved tester CIDRs before `deny all`. Do not use Basic auth on the API as it would conflict with bearer
Authorization. Obtain certificates for both names through the approved certificate workflow before enabling
443 blocks. Proposed DNS A records point both names to `52.44.225.198`; neither record has been changed.
Do not open 4000, 5432, 6379 or 18080 publicly. Check IPv6/security-group paths too.

If the current proxy is a container, do **not** use container localhost as the host upstream. After approval,
create a new `ght-operix-edge` bridge and attach only the existing shared proxy and Operix's web gateway.
Set `PROXY_MODE=docker-edge` so the release includes `compose.proxy.yml`. Use the gateway alias
`operix-staging-gateway:8080` in the two new vhosts and Docker DNS (`127.0.0.11`, variable-based upstream
with re-resolution) so gateway recreation does not leave a stale IP. Never attach API/PostgreSQL/Redis to
that edge network and never attach Operix to Tontin's private network. This proxy-network attachment is a
live change requiring approval. If it requires recreating the proxy, stop and schedule it; deployments
themselves do not recreate the proxy. Run `nginx -t`, then **reload only Nginx** after approval. No Tontin
application restart, `docker compose down`, system-wide prune or daemon restart is part of Operix release.

Before DNS/TLS approval, access can use an approved SSM port-forward to host port 18080; application URLs
and SMTP links still need the approved HTTPS hostname for the invite/reset acceptance exercise.

## Release and rollback

After all gates and approvals, push a reviewed commit to protected `main`. CI verifies the exact checkout,
publishes unique images, uploads a SHA-256-checked deployment bundle, then invokes document version **1**.
The host lock serializes releases, checks capacity, downloads only the expected artifact prefix, rejects
unsafe archive paths/symlinks, fetches only Operix secrets and pulls only Operix images. It does not git pull.
Review/update both the workflow's document version and the approved host bootstrap when changing the protocol.

For a new volume it starts the isolated database/Redis. Existing data services are not recreated during an
application deploy. It stops only Operix web/API for a short maintenance window, writes a `pg_dump -Fc`,
uploads an AES256-encrypted backup to the dedicated bucket, then executes **`prisma migrate deploy`**.
It never runs `migrate dev`, `db push`, seed, reset or default-account creation. A failed backup or migration
leaves Operix in maintenance and fails SSM; diagnose before retrying. Invalid historical ledger data may
intentionally abort the P0 migration. Never use `migrate resolve` to skip a failed migration without a review.

After migration it starts API and web, waits for database readiness and tests gateway/API routes. Successful
releases update root-owned `current` and `previous` symlinks. Automatic application rollback is allowed only
when the migration fingerprint is identical, and uses the previous release's Compose files and secret files.
If the schema fingerprint differs, failure keeps Operix in maintenance; it never guesses at database rollback.
There is no automatic traffic switch with zero downtime, and no production promotion job.

Operator inspection (read-only):

```bash
sudo readlink -f /opt/ght/apps/operix/current
sudo readlink -f /opt/ght/apps/operix/previous
docker ps --filter label=com.docker.compose.project=operix-staging
curl --fail http://127.0.0.1:18080/api/v1/health
```

Approved manual rollback, with the actual prior release ID (never a `latest` tag):

```bash
# Run via the approved fixed SSM document, or by an approved root operator.
sudo /usr/local/libexec/operix-receive-release \
  <previous-40-character-sha-run-attempt> \
  0000000000000000000000000000000000000000000000000000000000000000 rollback
```

The checksum argument is checked only when downloading a new deploy bundle; rollback accepts only an already
installed root-owned release. A different schema fingerprint refuses rollback. For schema changes, review
expand/contract compatibility and prepare a forward fix; restore a backup into a separate Operix database
first, verify migrations and balances, and approve any cutover/data loss. Never restore into Tontin or
automatically overwrite the current database. Retain both original volumes and backups until reconciliation
and the restore rehearsal pass. No routine deployment deletes volumes or runs global image cleanup.

## Restricted tester provisioning

Do not run `db:seed`, even with `SEED_DEMO_DATA=false`: the development seed still provisions/reset passwords
for baseline identities. New deployments have **zero users and organizations**, as the image smoke test checks.
The existing compiled `dist/cli/bootstrap-pilot.js` provisions roles/branches and an owner invitation, not a
default password. Running it writes application data and can send email, so perform a separate approved
dry-run/review and controlled invocation after SMTP, MFA and release gates pass. The invite command may print
a bearer link on mail failure; never run provisioning through a workflow/SSM log that broadly exposes output.
Finance, inventory, HR, payroll and field modules remain outside the enforced `core,crm,sales,projects` ceiling.
