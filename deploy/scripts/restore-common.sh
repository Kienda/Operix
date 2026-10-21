#!/usr/bin/env bash
# Shared scratch workflow so fault tests execute the real cleanup and restore logic.
operix_restore_archive() (
  set -Eeuo pipefail
  local archive=$1 expected=$2 image=$3 fixture=${4:-} work container_id='' name tables fixture_result toc expected_tables
  [[ -z $fixture || $fixture == synthetic-phase3b ]] || exit 2
  work=$(mktemp -d)
  cleanup() {
    local status=$?
    trap - EXIT
    if [[ $container_id =~ ^[0-9a-f]{64}$ ]]; then
      if ! docker rm -fv "$container_id" > /dev/null 2>&1; then
        echo 'Scratch container cleanup failed; operator inspection required' >&2
        status=1
      fi
    fi
    rm -rf -- "$work"
    exit "$status"
  }
  trap cleanup EXIT
  cp -- "$archive" "$work/backup.dump"
  operix_verify_archive_checksum "$work/backup.dump" "$expected"
  docker image inspect "$image" > /dev/null
  name="operix-restore-rehearsal-$(date -u +%Y%m%d%H%M%S)-$RANDOM-$RANDOM"
  docker container inspect "$name" > /dev/null 2>&1 && { echo 'Scratch name already exists' >&2; exit 1; }
  python3 -c 'import secrets; print(secrets.token_hex(32))' > "$work/postgres-password"
  chmod 0444 "$work/postgres-password"
  # The private work directory is0700; the read-only mounted password is disposable.
  # tmpfs overrides PostgreSQL's data VOLUME, preventing anonymous persistent data.
  container_id=$(docker create --pull=never --name "$name" --label operix.recovery=scratch \
    --network none --memory 512m --cpus 0.5 --pids-limit 128 --read-only --user 999:999 \
    --cap-drop ALL --security-opt no-new-privileges:true \
    --tmpfs /var/lib/postgresql/data:rw,noexec,nosuid,size=256m,uid=999,gid=999,mode=0700 \
    --tmpfs /var/run/postgresql:rw,noexec,nosuid,size=4m,uid=999,gid=999,mode=0700 \
    --tmpfs /tmp:rw,noexec,nosuid,size=16m,mode=1777 \
    --mount "type=bind,src=$work/postgres-password,dst=/run/secrets/postgres_password,readonly" \
    -e POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password -e POSTGRES_DB=operix_restore "$image")
  [[ $container_id =~ ^[0-9a-f]{64}$ ]] || { echo 'Unexpected scratch container ID' >&2; exit 1; }
  docker start "$container_id" > /dev/null
  operix_wait_for_postgres "$container_id"
  toc=$(docker exec -i "$container_id" pg_restore --list < "$work/backup.dump")
  expected_tables=$(printf '%s\n' "$toc" | awk '$4 == "TABLE" && $5 == "public" {n++} END {print n+0}')
  docker exec -i "$container_id" pg_restore -U postgres -d operix_restore --no-owner --no-privileges --exit-on-error < "$work/backup.dump"
  tables=$(docker exec "$container_id" psql -U postgres -d operix_restore -v ON_ERROR_STOP=1 -Atc \
    "SELECT count(*) FROM pg_tables WHERE schemaname='public';")
  [[ $tables =~ ^[0-9]+$ && $tables == "$expected_tables" ]] || { echo 'Restored public table count differs from archive' >&2; exit 1; }
  if [[ $fixture == synthetic-phase3b ]]; then
    fixture_result=$(docker exec "$container_id" psql -U postgres -d operix_restore -v ON_ERROR_STOP=1 -Atc \
      'SELECT count(*), sum(amount), count(*) FILTER (WHERE synthetic) FROM operix_recovery_fixture;')
    [[ $fixture_result == '3|60.00|3' ]] || { echo 'Synthetic fixture content verification failed' >&2; exit 1; }
  fi
  echo "Restore validated: public_tables=$tables sha256=$expected. Success requires scratch cleanup to complete."
)
