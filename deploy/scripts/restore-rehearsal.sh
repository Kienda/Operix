#!/usr/bin/env bash
# Restore rehearsal: downloads an Operix backup from S3, verifies its checksum,
# restores it into a THROWAWAY PostgreSQL container with no network, and prints
# what it contains. It never connects to the live Operix or Tontin databases.
#
#   sudo deploy/scripts/restore-rehearsal.sh            # newest scheduled backup
#   sudo deploy/scripts/restore-rehearsal.sh <s3-key>   # a specific object
set -Eeuo pipefail
umask 077
[[ $EUID == 0 ]] || { echo 'Run as root' >&2; exit 1; }
set -a
# shellcheck disable=SC1091
source /etc/operix/staging.env
set +a
[[ -n ${BACKUP_BUCKET:-} ]] || exit 2
PREFIX=operix-staging/scheduled/
KEY=${1:-$(aws s3api list-objects-v2 --bucket "$BACKUP_BUCKET" --prefix "$PREFIX" \
  --query 'sort_by(Contents,&LastModified)[-1].Key' --output text)}
[[ $KEY == operix-staging/* && $KEY != None ]] || { echo 'No backup found' >&2; exit 1; }

WORK=$(mktemp -d)
NAME="operix-restore-rehearsal-$(date -u +%Y%m%d%H%M%S)"
cleanup() { docker rm -f "$NAME" > /dev/null 2>&1 || true; rm -rf -- "$WORK"; }
trap cleanup EXIT

aws s3 cp "s3://$BACKUP_BUCKET/$KEY" "$WORK/backup.dump" --only-show-errors
EXPECTED=$(aws s3api head-object --bucket "$BACKUP_BUCKET" --key "$KEY" --query 'Metadata.sha256' --output text)
ACTUAL=$(sha256sum "$WORK/backup.dump" | cut -d' ' -f1)
if [[ $EXPECTED != None && $EXPECTED != "$ACTUAL" ]]; then
  echo "Checksum mismatch for $KEY" >&2
  exit 1
fi

# Same major version as production; isolated: no network, random throwaway password.
docker run -d --name "$NAME" --network none \
  -e POSTGRES_PASSWORD="$(openssl rand -hex 24)" -e POSTGRES_DB=operix_restore \
  postgres:16-bookworm > /dev/null
for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -U postgres -d operix_restore > /dev/null 2>&1 && break
  sleep 1
done
docker exec -i "$NAME" pg_restore -U postgres -d operix_restore --no-owner --no-privileges --exit-on-error < "$WORK/backup.dump"
docker exec "$NAME" psql -U postgres -d operix_restore -v ON_ERROR_STOP=1 -At -F ' ' -c "
  SELECT 'organizations', count(*) FROM \"Organization\"
  UNION ALL SELECT 'branches', count(*) FROM \"Branch\"
  UNION ALL SELECT 'active_members', count(*) FROM \"OrganizationUser\" WHERE status = 'ACTIVE'
  UNION ALL SELECT 'records', count(*) FROM \"BusinessRecord\" WHERE \"archivedAt\" IS NULL
  UNION ALL SELECT 'audit_events', count(*) FROM \"AuditLog\"
  UNION ALL SELECT 'last_migration', count(*) FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL;"
echo "Restore rehearsal PASSED for s3://$BACKUP_BUCKET/$KEY (sha256 $ACTUAL). Record the counts above in the runbook log."
