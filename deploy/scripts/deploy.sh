#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
BASE=/opt/ght/apps/operix
[[ $EUID == 0 && -f /etc/operix/staging.approved ]] || { echo 'Restricted staging has not been approved on this host' >&2; exit 1; }
[[ $# == 2 && $1 =~ ^[0-9a-f]{40}-[0-9]+-[0-9]+$ && $2 =~ ^(deploy|rollback)$ ]] || exit 2
RELEASE="$BASE/releases/$1"
[[ -d $RELEASE && $(realpath "$RELEASE") == "$RELEASE" ]] || exit 2
exec 9>"$BASE/deploy.lock"
flock -n 9 || { echo 'Another Operix release is running' >&2; exit 1; }
set -a
source /etc/operix/staging.env
set +a
[[ $AWS_REGION == us-east-1 && $AWS_ACCOUNT_ID =~ ^[0-9]{12}$ && $PROXY_MODE =~ ^(host|docker-edge)$ ]] || exit 2
export ECR_REGISTRY="$AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com"
export RELEASE_SHA="${1:0:40}" IMAGE_TAG="$1" SECRETS_DIR="$RELEASE/runtime"
compose() {
  local files=(-f "$RELEASE/deploy/compose.yml")
  [[ $PROXY_MODE == host ]] || files+=(-f "$RELEASE/deploy/compose.proxy.yml")
  docker compose --project-name operix-staging --env-file /dev/null "${files[@]}" "$@"
}
[[ $(df --output=avail -k "$BASE" | tail -1) -gt 10485760 ]] || { echo 'Need 10 GiB free for release and backup'; exit 1; }
[[ $(awk '/MemAvailable:/ {print $2}' /proc/meminfo) -gt 2097152 ]] || { echo 'Need 2 GiB available; preserve Tontin headroom'; exit 1; }
PREVIOUS=$(readlink -f "$BASE/current" || true)
if [[ $2 == deploy ]]; then
  [[ ! -e $SECRETS_DIR ]] || { echo 'Release already prepared; use a new run attempt'; exit 1; }
  python3 "$RELEASE/deploy/scripts/prepare-secrets.py" "$SECRETS_DIR"
  if [[ -n $PREVIOUS && -f $PREVIOUS/runtime/credential-fingerprint ]]; then
    cmp -s "$PREVIOUS/runtime/credential-fingerprint" "$SECRETS_DIR/credential-fingerprint" || { echo 'Database/Redis credential rotation requires a separate approved procedure'; exit 1; }
  fi
else
  [[ -f $SECRETS_DIR/api.json && -n $PREVIOUS ]] || exit 1
  cmp -s "$PREVIOUS/migrations.sha256" "$RELEASE/migrations.sha256" || { echo 'Schema differs: rollback requires a compatibility review and separate approval'; exit 1; }
fi
# ECR auth is kept in a per-deployment temporary directory, never the shared host config.
export DOCKER_CONFIG
DOCKER_CONFIG=$(mktemp -d "$BASE/.docker-auth.XXXXXX")
trap 'rm -rf -- "$DOCKER_CONFIG"' EXIT
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin "$ECR_REGISTRY" >/dev/null
compose config --quiet
compose --profile release pull api web migrate
compose pull postgres redis
if [[ $2 == deploy ]]; then
  # Do not silently recreate infrastructure on an application release.
  compose up -d --no-recreate --wait --wait-timeout 120 postgres redis
  if [[ -n $PREVIOUS ]]; then
    # Operix-only maintenance window. Tontin is never named or restarted.
    compose stop web api
  fi
  BACKUP="$BASE/backups/$(date -u +%Y%m%dT%H%M%SZ)-$1.dump"
  mkdir -p "$BASE/backups"
  compose exec -T postgres pg_dump -U operix_admin -d operix -Fc > "$BACKUP"
  [[ -s $BACKUP ]] || exit 1
  aws s3 cp "$BACKUP" "s3://$BACKUP_BUCKET/operix-staging/$(basename "$BACKUP")" --sse AES256 --only-show-errors
  # Database rollback is never automated. A failed migration stops the release.
  if ! compose --profile release run --rm --no-deps migrate; then
    echo 'Migration failed. Operix remains in maintenance; inspect the backup and migration state.' >&2
    exit 1
  fi
fi
if ! { compose up -d --no-deps --wait --wait-timeout 180 api web &&
  curl --fail --silent --max-time 10 "http://127.0.0.1:$OPERIX_HTTP_PORT/healthz" >/dev/null &&
  curl --fail --silent --max-time 10 "http://127.0.0.1:$OPERIX_HTTP_PORT/api/v1/health" >/dev/null; }; then
  if [[ -n $PREVIOUS ]] && cmp -s "$PREVIOUS/migrations.sha256" "$RELEASE/migrations.sha256"; then
    IMAGE_TAG=$(basename "$PREVIOUS")
    RELEASE_SHA=${IMAGE_TAG:0:40}
    SECRETS_DIR="$PREVIOUS/runtime"
    export IMAGE_TAG RELEASE_SHA SECRETS_DIR
    RELEASE="$PREVIOUS"
    compose up -d --no-deps --wait --wait-timeout 180 api web
    echo 'New release failed health checks; previous application images restored.' >&2
  else
    compose stop web api
    echo 'Health failed after schema change; manual compatibility review required.' >&2
  fi
  exit 1
fi
if [[ -n $PREVIOUS && $PREVIOUS != "$RELEASE" ]]; then ln -sfn "$PREVIOUS" "$BASE/previous"; fi
ln -sfn "$RELEASE" "$BASE/current"
echo "Operix restricted staging healthy: $1"
