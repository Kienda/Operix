#!/usr/bin/env bash
# Install this reviewed bootstrap as /usr/local/libexec/operix-receive-release.
# It is deliberately not self-updating from GitHub or S3.
set -Eeuo pipefail
umask 077
BASE=/opt/ght/apps/operix
[[ $EUID == 0 && -f /etc/operix/staging.approved && $# == 3 ]] || exit 1
id=$1 checksum=$2 mode=$3
[[ $id =~ ^[0-9a-f]{40}-[0-9]+-[0-9]+$ && $checksum =~ ^[0-9a-f]{64}$ && $mode =~ ^(deploy|rollback)$ ]] || exit 2
set -a; source /etc/operix/staging.env; set +a
target="$BASE/releases/$id"
if [[ $mode == deploy ]]; then
  [[ ! -e $target ]] || { echo 'Release exists; use a new workflow attempt'; exit 1; }
  mkdir -p "$BASE/releases"
  archive=$(mktemp "$BASE/releases/.artifact.XXXXXX")
  trap 'rm -f -- "$archive"' EXIT
  aws s3 cp "s3://$ARTIFACT_BUCKET/operix/releases/$id.tar.gz" "$archive" --region us-east-1 --only-show-errors
  printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check --status
  # Refuse path traversal, symlinks and non-deployment files before extraction.
  python3 - "$archive" "$target" "$id" <<'PY'
import json, re, sys, tarfile
from pathlib import PurePosixPath
with tarfile.open(sys.argv[1], 'r:gz') as archive:
    for member in archive.getmembers():
        p = PurePosixPath(member.name)
        if p.is_absolute() or '..' in p.parts or not (member.isfile() or member.isdir()):
            raise SystemExit('Unsafe deployment archive')
        if p.parts[0] not in ('deploy', 'migrations.sha256', 'release.json'):
            raise SystemExit('Unexpected deployment archive content')
    manifest = json.load(archive.extractfile('release.json'))
    if manifest != {'commit': sys.argv[3][:40], 'release': sys.argv[3]}:
        raise SystemExit('Release identity mismatch')
    fingerprint = archive.extractfile('migrations.sha256').read().decode().strip()
    if not re.fullmatch(r'[0-9a-f]{64}', fingerprint):
        raise SystemExit('Invalid migration fingerprint')
    archive.extractall(sys.argv[2], filter='data')
PY
  rm -f -- "$archive"
  trap - EXIT
else
  [[ -d $target && -f $target/release.json ]] || exit 1
fi
exec bash "$target/deploy/scripts/deploy.sh" "$id" "$mode"
