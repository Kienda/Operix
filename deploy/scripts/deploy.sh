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
[[ $AWS_REGION == us-east-1 && $AWS_ACCOUNT_ID =~ ^[0-9]{12}$ && $PROXY_MODE =~ ^(host|docker-edge|tunnel)$ ]] || exit 2
export ECR_REGISTRY="$AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com"
export RELEASE_SHA="${1:0:40}" IMAGE_TAG="$1" SECRETS_DIR="$RELEASE/runtime"
# shellcheck source=deploy/scripts/load-images.sh
source "$RELEASE/deploy/scripts/load-images.sh"
operix_load_images
python3 "$RELEASE/deploy/scripts/support-storage.py" check "$RELEASE/deploy/images.json" "$BASE/support-storage.json"
compose() {
  local files=(-f "$RELEASE/deploy/compose.yml")
  case $PROXY_MODE in
    docker-edge) files+=(-f "$RELEASE/deploy/compose.proxy.yml");;
    tunnel) files+=(-f "$RELEASE/deploy/compose.tunnel.yml");;
  esac
  docker compose --project-name operix-staging --env-file /dev/null "${files[@]}" "$@"
}
EDGE=(); [[ $PROXY_MODE != tunnel ]] || EDGE=(tunnel)
# Operix containers must never obtain the shared instance role from the metadata service.
# Matches only Operix's named bridges; Tontin's traffic never reaches these rules.
for bridge in opx-ingress opx-egress; do
  iptables -C DOCKER-USER -i "$bridge" -d 169.254.169.254 -j DROP 2>/dev/null ||
    iptables -I DOCKER-USER -i "$bridge" -d 169.254.169.254 -j DROP
done
[[ $(df --output=avail -k "$BASE" | tail -1) -gt 10485760 ]] || { echo 'Need 10 GiB free for release and backup'; exit 1; }
[[ $(awk '/MemAvailable:/ {print $2}' /proc/meminfo) -gt 2097152 ]] || { echo 'Need 2 GiB available; preserve Tontin headroom'; exit 1; }
PREVIOUS=$(readlink -f "$BASE/current" || true)
rollback_compatible() {
  [[ -n $PREVIOUS && -f $PREVIOUS/deploy/images.json ]] &&
    cmp -s "$PREVIOUS/migrations.sha256" "$RELEASE/migrations.sha256" &&
    cmp -s "$PREVIOUS/runtime/credential-fingerprint" "$RELEASE/runtime/credential-fingerprint" &&
    python3 "$RELEASE/deploy/scripts/image-manifest.py" "$PREVIOUS/deploy/images.json" "$ECR_REGISTRY" "$(basename "$PREVIOUS")" > /dev/null &&
    python3 "$RELEASE/deploy/scripts/support-storage.py" check "$PREVIOUS/deploy/images.json" "$BASE/support-storage.json"
}
if [[ $2 == deploy ]]; then
  [[ ! -e $SECRETS_DIR ]] || { echo 'Release already prepared; use a new run attempt'; exit 1; }
  python3 "$RELEASE/deploy/scripts/prepare-secrets.py" "$SECRETS_DIR"
  [[ $PROXY_MODE != tunnel || -f $SECRETS_DIR/tunnel_token ]] || { echo 'PROXY_MODE=tunnel needs CLOUDFLARE_TUNNEL_TOKEN in the runtime secret'; exit 1; }
  if [[ -n $PREVIOUS && -f $PREVIOUS/runtime/credential-fingerprint ]]; then
    cmp -s "$PREVIOUS/runtime/credential-fingerprint" "$SECRETS_DIR/credential-fingerprint" || { echo 'Database/Redis credential rotation requires a separate approved procedure'; exit 1; }
  fi
else
  [[ -f $SECRETS_DIR/api.json && -n $PREVIOUS ]] || exit 1
  cmp -s "$PREVIOUS/migrations.sha256" "$RELEASE/migrations.sha256" || { echo 'Schema differs: rollback requires a compatibility review and separate approval'; exit 1; }
  cmp -s "$PREVIOUS/runtime/credential-fingerprint" "$SECRETS_DIR/credential-fingerprint" || { echo 'Credential mismatch: rollback requires separate approval'; exit 1; }
fi
# ECR auth is kept in a per-deployment temporary directory, never the shared host config.
export DOCKER_CONFIG
DOCKER_CONFIG=$(mktemp -d "$BASE/.docker-auth.XXXXXX")
trap 'rm -rf -- "$DOCKER_CONFIG"' EXIT
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin "$ECR_REGISTRY" >/dev/null
compose config --quiet
compose --profile release pull api web migrate "${EDGE[@]}"
compose pull postgres redis
if [[ $2 == deploy ]]; then
  # Do not silently recreate infrastructure on an application release.
  compose up -d --no-recreate --wait --wait-timeout 120 postgres redis
  python3 "$RELEASE/deploy/scripts/support-storage.py" record "$RELEASE/deploy/images.json" "$BASE/support-storage.json"
  if [[ -n $PREVIOUS ]]; then
    # Operix-only maintenance window. Tontin is never named or restarted.
    compose stop web api
  fi
  BACKUP="$BASE/backups/$(date -u +%Y%m%dT%H%M%SZ)-$1.dump"
  mkdir -p "$BASE/backups"
  # shellcheck source=deploy/scripts/recovery-common.sh
  source "$RELEASE/deploy/scripts/recovery-common.sh"
  operix_create_backup "$BACKUP" "$BACKUP_BUCKET" "operix-staging/$(basename "$BACKUP")" "$IMAGE_TAG" > /dev/null
  # Database rollback is never automated. A failed migration stops the release.
  if ! compose --profile release run --rm --no-deps migrate; then
    echo 'Migration failed. Operix remains in maintenance; inspect the backup and migration state.' >&2
    exit 1
  fi
fi
if ! { compose up -d --no-deps --wait --wait-timeout 180 api web &&
  curl --fail --silent --max-time 10 "http://127.0.0.1:$OPERIX_HTTP_PORT/healthz" >/dev/null &&
  curl --fail --silent --max-time 10 "http://127.0.0.1:$OPERIX_HTTP_PORT/api/v1/health" >/dev/null; }; then
  if rollback_compatible; then
    IMAGE_TAG=$(basename "$PREVIOUS")
    RELEASE_SHA=${IMAGE_TAG:0:40}
    SECRETS_DIR="$PREVIOUS/runtime"
    export IMAGE_TAG RELEASE_SHA SECRETS_DIR
    RELEASE="$PREVIOUS"
    operix_load_images
    python3 "$RELEASE/deploy/scripts/support-storage.py" check "$RELEASE/deploy/images.json" "$BASE/support-storage.json"
    compose up -d --no-deps --wait --wait-timeout 180 api web "${EDGE[@]}"
    echo 'New release failed health checks; previous application images restored.' >&2
  else
    compose stop "${EDGE[@]}" web api
    echo 'Health failed after schema change; manual compatibility review required.' >&2
  fi
  exit 1
fi
# Expose the release through the tunnel only after it passed its health checks.
[[ ${#EDGE[@]} == 0 ]] || compose up -d --no-deps "${EDGE[@]}"
if [[ -n $PREVIOUS && $PREVIOUS != "$RELEASE" ]]; then ln -sfn "$PREVIOUS" "$BASE/previous"; fi
ln -sfn "$RELEASE" "$BASE/current"
echo "Operix restricted staging healthy: $1"
