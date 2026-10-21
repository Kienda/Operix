#!/usr/bin/env bash
# Explicitly approved workstation-only rehearsal; NEVER call from deployment/CI.
# Usage: bash deploy/scripts/rehearse-synthetic-recovery.sh phase3b-<approved-id>
# Creates two scratch containers sequentially and writes one encrypted synthetic S3 object.
set -Eeuo pipefail
umask 077
[[ $# == 1 && $1 =~ ^phase3b-[0-9]{8}-[0-9a-f]{8}$ ]] || exit 2
grep -qi microsoft /proc/sys/kernel/osrelease || { echo 'Run on the approved Windows/WSL recovery workstation, not EC2' >&2; exit 1; }
HERE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd -- "$HERE/../.." && pwd)
# shellcheck source=deploy/scripts/recovery-common.sh
source "$HERE/recovery-common.sh"
# shellcheck source=deploy/scripts/restore-common.sh
source "$HERE/restore-common.sh"
DOCKER_CLI='/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe'
AWS_CLI='/mnt/c/Program Files/Amazon/AWSCLIV2/aws.exe'
[[ -x $DOCKER_CLI && -x $AWS_CLI ]] || { echo 'Required workstation CLIs unavailable' >&2; exit 1; }
ENDPOINT=$("$DOCKER_CLI" context inspect desktop-linux --format '{{.Endpoints.docker.Host}}' | tr -d '\r')
[[ $ENDPOINT == npipe:////./pipe/dockerDesktopLinuxEngine ]] || { echo 'Expected local Docker Desktop engine; refusing remote contexts' >&2; exit 1; }
# shellcheck source=deploy/scripts/recovery-workstation.sh
source "$HERE/recovery-workstation.sh"
docker() { operix_workstation_docker "$DOCKER_CLI" "$@"; }
aws() { operix_workstation_aws "$AWS_CLI" "$@"; }
[[ $(aws sts get-caller-identity --region us-east-1 --query Account --output text) == 471112967488 ]] || exit 1
IMAGE=postgres:16-bookworm@sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4
docker image inspect "$IMAGE" > /dev/null
BEFORE=$(docker ps -aq --filter label=operix.recovery | sort)
WORK=$(mktemp -d "$ROOT/tmp/$1.XXXXXX")
export TMPDIR="$WORK"
SOURCE_ID=''
cleanup() {
  local status=$?
  trap - EXIT
  if [[ $SOURCE_ID =~ ^[0-9a-f]{64}$ ]]; then
    docker rm -fv "$SOURCE_ID" > /dev/null 2>&1 || status=1
  fi
  rm -rf -- "$WORK"
  exit "$status"
}
trap cleanup EXIT
python3 -c 'import secrets; print(secrets.token_hex(32))' > "$WORK/fixture-password"
chmod 0444 "$WORK/fixture-password"
SOURCE_ID=$(docker create --pull=never --name "operix-$1-source" --label operix.recovery=synthetic-source \
  --network none --memory 512m --cpus 0.5 --pids-limit 128 --read-only --user 999:999 \
  --cap-drop ALL --security-opt no-new-privileges:true \
  --tmpfs /var/lib/postgresql/data:rw,noexec,nosuid,size=256m,uid=999,gid=999,mode=0700 \
  --tmpfs /var/run/postgresql:rw,noexec,nosuid,size=4m,uid=999,gid=999,mode=0700 \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m,mode=1777 \
  --mount "type=bind,src=$WORK/fixture-password,dst=/run/secrets/fixture_password,readonly" \
  -e POSTGRES_PASSWORD_FILE=/run/secrets/fixture_password -e POSTGRES_USER=operix_admin -e POSTGRES_DB=operix "$IMAGE")
[[ $SOURCE_ID =~ ^[0-9a-f]{64}$ ]] || exit 1
docker start "$SOURCE_ID" > /dev/null
operix_wait_for_postgres "$SOURCE_ID" operix_admin operix
docker exec -i "$SOURCE_ID" psql -U operix_admin -d operix -v ON_ERROR_STOP=1 > /dev/null <<'SQL'
CREATE TABLE operix_recovery_fixture (
 id integer PRIMARY KEY, label text NOT NULL, amount numeric(12,2) NOT NULL,
 synthetic boolean NOT NULL CHECK (synthetic)
);
INSERT INTO operix_recovery_fixture VALUES
 (1, 'SYNTHETIC-ONE', 10.00, true), (2, 'SYNTHETIC-TWO', 20.00, true), (3, 'SYNTHETIC-THREE', 30.00, true);
SQL
compose() {
  [[ $1 == exec && $2 == -T && $3 == postgres ]] || return 2
  shift 3
  docker exec -i "$SOURCE_ID" "$@"
}
BUCKET=operix-staging-backupsbucket-urxntjv3dvse
KEY="operix-staging/rehearsals/$1/fixture.dump"
RELEASE=1696ac8293e6994f038666684c6fd23f3cb8ef98-39500102063-1
SHA=$(operix_create_backup "$WORK/source.dump" "$BUCKET" "$KEY" "$RELEASE")
docker rm -fv "$SOURCE_ID" > /dev/null
SOURCE_ID=''
# Operator-assisted read: Windows AWS profile, never credentials inside a container/on EC2.
METADATA=$(aws s3api head-object --region us-east-1 --bucket "$BUCKET" --key "$KEY" \
  --checksum-mode ENABLED --query '[Metadata.sha256,ServerSideEncryption]' --output json)
EXPECTED=$(printf '%s' "$METADATA" | python3 -c 'import json,sys; x=json.load(sys.stdin); assert x[1]=="AES256"; print(x[0])')
[[ $EXPECTED == "$SHA" ]] || { echo 'Uploaded metadata differs from source checksum' >&2; exit 1; }
aws s3api get-object --region us-east-1 --bucket "$BUCKET" --key "$KEY" --checksum-mode ENABLED \
  "$WORK/operator-download.dump" > /dev/null
operix_restore_archive "$WORK/operator-download.dump" "$EXPECTED" "$IMAGE" synthetic-phase3b
AFTER=$(docker ps -aq --filter label=operix.recovery | sort)
[[ $BEFORE == "$AFTER" ]] || { echo 'Scratch container baseline differs; inspect before continuing' >&2; exit 1; }
printf 'PASS: synthetic fixture restored (3 rows, total60.00); S3 checksum/encryption verified; scratch containers removed.\n'
printf 'Retained synthetic backup only: s3://%s/%s sha256=%s\n' "$BUCKET" "$KEY" "$SHA"
