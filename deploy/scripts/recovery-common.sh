#!/usr/bin/env bash
# Shared by pre-migration and scheduled backups. Callers supply the scoped compose function.
operix_create_backup() (
  set -Eeuo pipefail
  local final=$1 bucket=$2 key=$3 release=$4 partial='' sha encoded received
  [[ $release =~ ^[0-9a-f]{40}-[0-9]+-[0-9]+$ && $bucket =~ ^[a-z0-9][a-z0-9.-]+$ &&
     $key == operix-staging/* && $key != *'..'* && $key =~ ^[A-Za-z0-9/_.-]+$ ]] || exit 2
  [[ ! -e $final && ! -L $final ]] || { echo 'Backup destination already exists' >&2; exit 1; }
  trap '[[ -z $partial ]] || rm -f -- "$partial"' EXIT
  partial=$(mktemp "$final.partial.XXXXXX")
  compose exec -T postgres pg_dump -U operix_admin -d operix -Fc > "$partial"
  [[ -s $partial ]] || { echo 'Empty database dump; upload refused' >&2; exit 1; }
  compose exec -T postgres pg_restore --list < "$partial" > /dev/null
  sha=$(sha256sum "$partial" | cut -d' ' -f1)
  [[ $sha =~ ^[0-9a-f]{64}$ ]] || exit 1
  encoded=$(python3 -c 'import base64,sys; print(base64.b64encode(bytes.fromhex(sys.argv[1])).decode())' "$sha")
  # Single-part PutObject is intentionally bounded. S3 validates the supplied checksum;
  # its returned checksum proves upload integrity without granting the instance GetObject.
  [[ $(stat -c %s "$partial") -le 5368709120 ]] || { echo 'Dump requires a separately reviewed multipart procedure' >&2; exit 1; }
  received=$(aws s3api put-object --region us-east-1 --bucket "$bucket" --key "$key" \
    --body "$partial" --server-side-encryption AES256 --metadata "sha256=$sha,release=$release" \
    --checksum-algorithm SHA256 --checksum-sha256 "$encoded" --if-none-match '*' \
    --query ChecksumSHA256 --output text)
  [[ $received == "$encoded" ]] || { echo 'S3 upload checksum not confirmed; release blocked' >&2; exit 1; }
  # Atomic no-clobber publication: failed/partial dumps never look like usable backups.
  ln -- "$partial" "$final"
  printf '%s\n' "$sha"
)

operix_verify_archive_checksum() {
  local archive=$1 expected=$2 actual
  [[ $expected =~ ^[0-9a-f]{64}$ ]] || { echo 'A valid SHA256 checksum is mandatory' >&2; return 1; }
  [[ -f $archive && -s $archive ]] || { echo 'Backup archive is absent or empty' >&2; return 1; }
  actual=$(sha256sum "$archive" | cut -d' ' -f1)
  [[ $actual == "$expected" ]] || { echo 'Backup checksum mismatch' >&2; return 1; }
}

operix_wait_for_postgres() {
  local container=$1 user=${2:-postgres} database=${3:-operix_restore} attempt
  for ((attempt=0; attempt<60; attempt++)); do
    # The official entrypoint briefly starts a temporary initialization server.
    # Wait until PID 1 has exec'd the final server before accepting readiness.
    if [[ $(docker exec "$container" cat /proc/1/comm 2>/dev/null) == postgres ]] &&
       docker exec "$container" pg_isready -U "$user" -d "$database" > /dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo 'Restore PostgreSQL readiness timed out' >&2
  return 1
}
