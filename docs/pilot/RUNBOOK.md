# Backup, restore and rollback runbook — GHT pilot

Host: shared EC2 (us-east-1), Operix under `/opt/ght/apps/operix`, Compose project `operix-staging`.
Tontin shares the host: **never** run `docker compose down` for another project, `docker system prune`,
a daemon restart, or any command against Tontin's containers, volumes or networks.
Architecture and release mechanics: [deploy/README.md](../../deploy/README.md).

## Operator shell setup

Every command below assumes this root shell (it mirrors `deploy/scripts/backup.sh`):

```bash
sudo -i
set -a; source /etc/operix/staging.env; set +a
BASE=/opt/ght/apps/operix
CURRENT=$(readlink -f "$BASE/current"); IMAGE_TAG=$(basename "$CURRENT")
export ECR_REGISTRY="$AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com" IMAGE_TAG \
       RELEASE_SHA="${IMAGE_TAG:0:40}" SECRETS_DIR="$CURRENT/runtime"
files=(-f "$CURRENT/deploy/compose.yml"); [[ ${PROXY_MODE:-host} == host ]] || files+=(-f "$CURRENT/deploy/compose.proxy.yml")
oc() { docker compose --project-name operix-staging --env-file /dev/null "${files[@]}" "$@"; }
```

Health at a glance: `oc ps` · `curl -fsS http://127.0.0.1:18080/api/v1/health` · `oc logs --since 15m api`.

## 1. Backups

| Backup | When | Where | Retention |
| --- | --- | --- | --- |
| Pre-release | Every deploy, before migrations (`deploy.sh`) | `s3://$BACKUP_BUCKET/operix-staging/` | Bucket lifecycle (agree: ≥ 90 days) |
| Scheduled | Daily 06:30 UTC ± 10 min (`operix-backup.timer`, catches up after downtime) | `s3://$BACKUP_BUCKET/operix-staging/scheduled/` | Same; last 3 also kept locally |

Each is a `pg_dump -Fc` of the Operix database only, validated with `pg_restore --list`, SHA-256
recorded as object metadata, uploaded with server-side encryption (SSE-S3, AES-256) to a versioned,
private, Operix-only bucket. Backups contain staff identities and customer data: access to the bucket
is restricted to the instance role and named administrators.

Install the schedule (once, after approval):

```bash
install -m 0755 "$CURRENT/deploy/scripts/backup.sh" /usr/local/libexec/operix-backup
install -m 0644 "$CURRENT"/deploy/systemd/operix-backup.{service,timer} /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now operix-backup.timer
systemctl start operix-backup.service && journalctl -u operix-backup -n 20   # first run
```

Daily check (or alarm): `cat $BASE/backups/last-success.json` must be < 26 hours old.
A failed run exits non-zero; `systemctl --failed` and the journal show why.

**Recovery objectives for the pilot:** RPO 24 h (worst case: one day of entries re-keyed), RTO 4 h.
If GHT needs better, add a second daily run or WAL archiving.

## 2. Restore rehearsal (monthly, and after any backup change)

```bash
"$CURRENT/deploy/scripts/restore-rehearsal.sh"          # newest scheduled backup
"$CURRENT/deploy/scripts/restore-rehearsal.sh" <s3-key> # a specific one
```

It downloads the dump, checks its SHA-256, restores into a throwaway PostgreSQL 16 container with
**no network**, prints row counts, then deletes the container. It never touches the live database.
Record in the log below: date, key, counts, operator. Compare counts with what the app shows.

| Date | Backup key | Orgs/branches/members/records/audit | Operator |
| --- | --- | --- | --- |
| | | | |

## 3. Release rollback

**Automatic.** A new release that fails its health checks is rolled back to the previous images by
`deploy.sh` — only when the database migrations are identical (same fingerprint). If the schema
changed, Operix stays in maintenance and the SSM command fails; nothing guesses at a database rollback.

**Manual, same schema** (e.g. a UI defect found after release):

```bash
readlink -f $BASE/previous              # note the release ID
/usr/local/libexec/operix-receive-release <previous-release-id> \
  0000000000000000000000000000000000000000000000000000000000000000 rollback
curl -fsS http://127.0.0.1:18080/api/v1/health
```

**Schema changed.** Prefer a forward fix released through CI. Only if data is damaged, go to § 4.

## 4. Disaster restore (data loss or corruption)

Decide with the Owner first: restoring loses everything entered after the backup.

1. Put Operix in maintenance: `oc stop web api`. (Tontin is unaffected.)
2. Keep the damaged data: `oc exec -T postgres pg_dump -U operix_admin -d operix -Fc > $BASE/backups/pre-restore-$(date -u +%Y%m%dT%H%M%SZ).dump`
3. Run the rehearsal (§ 2) on the chosen backup and confirm the counts.
4. Restore into a **new** database, verify, then swap:
   ```bash
   aws s3 cp s3://$BACKUP_BUCKET/<key> /root/restore.dump
   oc exec -T postgres createdb -U operix_admin -O operix_migrator operix_restored
   oc exec -T postgres pg_restore -U operix_admin -d operix_restored --exit-on-error < /root/restore.dump
   # Database-level grants are not part of pg_dump; repeat the ones from deploy/docker/init-db.sh.
   oc exec -T postgres psql -U operix_admin -d operix_restored -v ON_ERROR_STOP=1 -c \
     'ALTER SCHEMA public OWNER TO operix_migrator; REVOKE CREATE ON SCHEMA public FROM PUBLIC;
      GRANT CONNECT ON DATABASE operix_restored TO operix_app; GRANT USAGE ON SCHEMA public TO operix_app;'
   oc exec -T postgres psql -U operix_admin -d postgres -c \
     'ALTER DATABASE operix RENAME TO operix_damaged; ALTER DATABASE operix_restored RENAME TO operix;'
   ```
5. Re-apply privilege hardening and pending migrations: `oc --profile release run --rm migrate`.
6. `oc start api web`, check health, sign in as the Owner, spot-check recent records.
7. Tell staff what period must be re-entered. Keep `operix_damaged` and both dumps until the Owner
   signs off, then drop `operix_damaged` and shred `/root/restore.dump`.

## MFA reset (lost authenticator)

Until a self-service recovery exists, only for an Owner or Administrator who lost their device:

1. Another **owner** verifies identity out-of-band (video call or in person; never by email alone)
   and records who approved it.
2. Operator runs, with the person's exact email:
   ```sql
   -- oc exec -T postgres psql -U operix_admin -d operix -v email='person@globalhightech.com'
   BEGIN;
   UPDATE "User" SET "mfaEnabled" = false, "mfaSecret" = NULL, "pendingMfaSecret" = NULL,
          "pendingMfaExpiresAt" = NULL, "pendingMfaSessionId" = NULL
    WHERE email = :'email' RETURNING id;
   UPDATE "Session" SET "revokedAt" = now()
    WHERE "userId" = (SELECT id FROM "User" WHERE email = :'email') AND "revokedAt" IS NULL;
   INSERT INTO "AuditLog" (id, "userId", action, resource, "resourceId", metadata)
   SELECT gen_random_uuid(), id, 'MFA_RESET_BY_OPERATOR', 'user', id::text,
          jsonb_build_object('approvedBy', '<approving owner email>')
     FROM "User" WHERE email = :'email';
   COMMIT;
   ```
   Exactly one row must be returned by the first statement; otherwise `ROLLBACK`.
3. The person signs in and is forced to enroll a new authenticator before using Operix.

## Incident quick reference

| Symptom | First action |
| --- | --- |
| Uptime probe red / `/health` 503 | `oc ps`, `oc logs --since 15m api postgres`; DB down → `oc start postgres` |
| Disk > 85 % | `df -h /opt`, `docker system df`; delete only old **Operix** local dumps beyond the last 3 |
| Suspected account compromise | Suspend the member (Team), check Audit log, rotate their password via reset |
| Suspected server compromise | Owner + AWS admin: isolate the instance security group, snapshot EBS, do not reboot |
| Invitations not arriving | `oc logs api \| grep mail`; check provider dashboard and SPF/DKIM/DMARC |
