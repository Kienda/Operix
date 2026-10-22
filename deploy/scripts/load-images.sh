#!/usr/bin/env bash
# Caller supplies RELEASE, ECR_REGISTRY and IMAGE_TAG; no secrets in this file.
operix_load_images() {
  local file
  file=$(mktemp)
  if ! python3 "$RELEASE/deploy/scripts/image-manifest.py" "$RELEASE/deploy/images.json" "$ECR_REGISTRY" "$IMAGE_TAG" > "$file"; then
    rm -f -- "$file"
    return 1
  fi
  # Only validated fixed keys and ECR digest references may reach the shell.
  # shellcheck disable=SC1090
  source "$file"
  rm -f -- "$file"
}
