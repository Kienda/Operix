#!/usr/bin/env bash
# The approved one-off Phase3B S3-writing rehearsal is complete; do not replay it.
set -Eeuo pipefail
echo 'Use deploy/tests/support_candidates_smoke.py for disposable compatibility tests. New S3 rehearsals require separate approval.' >&2
exit 1
