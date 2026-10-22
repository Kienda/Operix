#!/usr/bin/env python3
"""Refuse automatic support-image/data-format changes or unknown existing volumes."""
import json
from pathlib import Path
import subprocess
import sys

VOLUMES = ("operix-staging_postgres_data", "operix-staging_redis_data")


def check(manifest, recorded, existing):
    desired = {"storage": manifest["storage"], "images": {n: manifest["images"][n] for n in ("postgres", "redis")}}
    if recorded is None and existing:
        raise ValueError("Existing storage without approved identity; separate logical restore review required")
    if recorded is not None and recorded != desired:
        raise ValueError("Supporting image/storage change requires separate compatibility approval")
    if recorded is not None and set(existing) != set(VOLUMES):
        raise ValueError("Recorded storage missing; refuse silent database reinitialization")
    return desired


if __name__ == "__main__":
    if len(sys.argv) != 4 or sys.argv[1] not in ("check", "record"):
        raise SystemExit("Usage: support-storage.py check|record manifest identity-file")
    manifest = json.loads(Path(sys.argv[2]).read_text())
    marker = Path(sys.argv[3])
    recorded = json.loads(marker.read_text()) if marker.exists() else None
    # List once so Docker daemon errors cannot masquerade as absent volumes.
    result = subprocess.run(["docker", "volume", "ls", "--format", "{{.Name}}"], check=True, capture_output=True, text=True)
    existing = set(result.stdout.splitlines()) & set(VOLUMES)
    if sys.argv[1] == "record" and recorded is None:
        if existing != set(VOLUMES):
            raise SystemExit("Both newly initialized volumes must exist before recording")
        desired = {"storage": manifest["storage"], "images": {n: manifest["images"][n] for n in ("postgres", "redis")}}
        with marker.open("x") as stream:
            json.dump(desired, stream)
    else:
        check(manifest, recorded, existing)
