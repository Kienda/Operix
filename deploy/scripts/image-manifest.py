#!/usr/bin/env python3
"""Fail-closed seven-image release lock; never accepts tags or another AWS account."""
import json
from pathlib import Path
import re
import sys

NAMES = ("api", "worker", "migrate", "web", "tunnel", "postgres", "redis")


def validate(manifest, registry, release):
    if not re.fullmatch(r"[0-9]{12}\.dkr\.ecr\.us-east-1\.amazonaws\.com", registry):
        raise ValueError("Invalid ECR registry")
    if not re.fullmatch(r"[0-9a-f]{40}-[0-9]+-[0-9]+", release):
        raise ValueError("Invalid release identity")
    if set(manifest) != {"schema", "release", "images", "storage"} or manifest["schema"] != 1 or manifest["release"] != release:
        raise ValueError("Image manifest identity/schema mismatch")
    if manifest["storage"] != {"postgres": "16-alpine-uid70", "redis": "7.4-aof"}:
        raise ValueError("Unsupported database storage contract")
    if set(manifest["images"]) != set(NAMES):
        raise ValueError("Exactly seven release images required")
    for name, image in manifest["images"].items():
        if not isinstance(image, str) or not re.fullmatch(re.escape(registry + "/operix-" + name) + r"@sha256:[0-9a-f]{64}", image):
            raise ValueError("Invalid immutable image reference: " + name)
    return manifest


def exports(manifest):
    # validate() restricts every character before this is consumed by source.
    return "\n".join(f"export {name.upper()}_IMAGE={manifest['images'][name]}" for name in NAMES) + "\n"


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit("Usage: image-manifest.py manifest registry release")
    print(exports(validate(json.loads(Path(sys.argv[1]).read_text()), sys.argv[2], sys.argv[3])), end="")
