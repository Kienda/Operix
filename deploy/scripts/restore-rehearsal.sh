#!/usr/bin/env bash
# Operator-assisted recovery: --archive /private/backup.dump --sha256 <S3 metadata>.
# Or use [scoped-s3-key] on a recovery machine with authorized AWS credentials.
set -Eeuo pipefail
umask 077
[[ $EUID == 0 ]] || { echo 'Run as root' >&2; exit 1; }
HERE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=deploy/scripts/recovery-common.sh
source "$HERE/recovery-common.sh"
# Use the current reviewed release's immutable PostgreSQL recovery image.
# This does not fetch runtime secrets or grant additional S3 read permissions.
RELEASE=${OPERIX_RECOVERY_RELEASE_DIR:-$(readlink -f /opt/ght/apps/operix/current)}
[[ -d $RELEASE ]] || { echo 'Provide a checksum-verified release directory via OPERIX_RECOVERY_RELEASE_DIR' >&2; exit 1; }
export ECR_REGISTRY=471112967488.dkr.ecr.us-east-1.amazonaws.com
IMAGE_TAG=$(basename "$RELEASE")
export IMAGE_TAG
# shellcheck source=deploy/scripts/load-images.sh
source "$HERE/load-images.sh"
operix_load_images
IMAGE=$POSTGRES_IMAGE
LOCAL_ARCHIVE='' EXPECTED='' KEY=''
if [[ $# == 4 && $1 == --archive && $3 == --sha256 ]]; then
  LOCAL_ARCHIVE=$2 EXPECTED=$4
elif [[ $# -le 1 ]]; then
  set -a
  # shellcheck disable=SC1091
  source /etc/operix/staging.env
  set +a
  [[ $AWS_REGION == us-east-1 && -n ${BACKUP_BUCKET:-} ]] || exit 2
  KEY=${1:-$(aws s3api list-objects-v2 --region us-east-1 --bucket "$BACKUP_BUCKET" --prefix operix-staging/scheduled/ \
    --query 'sort_by(Contents,&LastModified)[-1].Key' --output text)}
  [[ $KEY == operix-staging/* && $KEY != *'..'* && $KEY =~ ^[A-Za-z0-9/_.-]+$ ]] || { echo 'No valid scoped backup key' >&2; exit 1; }
else
  echo 'Use [scoped-s3-key] or --archive <file> --sha256 <checksum>' >&2
  exit 2
fi
# shellcheck source=deploy/scripts/restore-common.sh
source "$HERE/restore-common.sh"
if [[ -n $LOCAL_ARCHIVE ]]; then
  operix_restore_archive "$LOCAL_ARCHIVE" "$EXPECTED" "$IMAGE"
else
  WORK=$(mktemp -d)
  trap 'rm -rf -- "$WORK"' EXIT
  EXPECTED=$(aws s3api head-object --region us-east-1 --bucket "$BACKUP_BUCKET" --key "$KEY" --query 'Metadata.sha256' --output text)
  [[ $EXPECTED =~ ^[0-9a-f]{64}$ ]] || { echo 'A valid S3 SHA256 checksum is mandatory' >&2; exit 1; }
  aws s3 cp "s3://$BACKUP_BUCKET/$KEY" "$WORK/backup.dump" --region us-east-1 --only-show-errors
  operix_restore_archive "$WORK/backup.dump" "$EXPECTED" "$IMAGE"
fi
