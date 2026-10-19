#!/usr/bin/env bash
# Scheduled Operix database backup (run by operix-backup.timer as root).
# pg_dump (custom format) -> archive validation -> SHA-256 -> S3 (SSE) under the
# Operix-only backup prefix. Never touches Tontin; waits for any running release.
set -Eeuo pipefail
umask 077
BASE=/opt/ght/apps/operix
KEEP_LOCAL=${KEEP_LOCAL:-3}
[[ $EUID == 0 && -f /etc/operix/staging.approved ]] || { echo 'Restricted staging has not been approved on this host' >&2; exit 1; }
set -a
# shellcheck disable=SC1091
source /etc/operix/staging.env
set +a
[[ $AWS_REGION == us-east-1 && $AWS_ACCOUNT_ID =~ ^[0-9]{12}$ && -n ${BACKUP_BUCKET:-} ]] || exit 2
CURRENT=$(readlink -f "$BASE/current") || { echo 'No deployed Operix release to back up' >&2; exit 1; }
IMAGE_TAG=$(basename "$CURRENT")
export ECR_REGISTRY="$AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com"
export IMAGE_TAG RELEASE_SHA="${IMAGE_TAG:0:40}" SECRETS_DIR="$CURRENT/runtime"
compose() {
  local files=(-f "$CURRENT/deploy/compose.yml")
  case ${PROXY_MODE:-host} in
    docker-edge) files+=(-f "$CURRENT/deploy/compose.proxy.yml");;
    tunnel) files+=(-f "$CURRENT/deploy/compose.tunnel.yml");;
  esac
  docker compose --project-name operix-staging --env-file /dev/null "${files[@]}" "$@"
}
# Never interleave with a release (which takes its own pre-migration backup).
exec 9>"$BASE/deploy.lock"
flock -w 900 9 || { echo 'A release is still running; backup skipped' >&2; exit 1; }

mkdir -p "$BASE/backups"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
FILE="$BASE/backups/$STAMP-scheduled.dump"
compose exec -T postgres pg_dump -U operix_admin -d operix -Fc > "$FILE"
[[ -s $FILE ]] || { echo 'Empty dump' >&2; exit 1; }
# A dump that pg_restore cannot list is not a backup.
compose exec -T postgres pg_restore --list < "$FILE" > /dev/null
SHA=$(sha256sum "$FILE" | cut -d' ' -f1)
aws s3 cp "$FILE" "s3://$BACKUP_BUCKET/operix-staging/scheduled/$(basename "$FILE")" \
  --sse AES256 --metadata "sha256=$SHA,release=$IMAGE_TAG" --only-show-errors

# Local copies are a convenience only; S3 (versioned) is the backup of record.
find "$BASE/backups" -maxdepth 1 -name '*-scheduled.dump' -type f -printf '%T@ %p\n' \
  | sort -rn | tail -n +"$((KEEP_LOCAL + 1))" | cut -d' ' -f2- | xargs -r rm -f --
printf '{"time":"%s","file":"%s","sha256":"%s","release":"%s"}\n' \
  "$STAMP" "$(basename "$FILE")" "$SHA" "$IMAGE_TAG" > "$BASE/backups/last-success.json"
echo "Operix backup uploaded: $(basename "$FILE") sha256=$SHA"
