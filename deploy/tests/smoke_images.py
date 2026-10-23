"""Resolve the exact seven images tested by the disposable application smoke."""
import json
import os
from pathlib import Path
import re
import subprocess

NAMES = ("api", "worker", "migrate", "web", "tunnel", "postgres", "redis")


def select_images(image_file=None, candidate_mode=False, runner=subprocess.run):
    if (image_file or candidate_mode) and os.environ.get("CI") != "true":
        raise SystemExit("Selected/candidate application smoke runs only in disposable CI")
    if image_file and candidate_mode:
        raise ValueError("Selected images and candidate mode cannot be combined")
    if image_file:
        chosen = json.loads(Path(image_file).read_text(encoding="utf-8"))
        if not isinstance(chosen, dict) or set(chosen) != set(NAMES) or not all(
                isinstance(image, str) and re.fullmatch(r"sha256:[0-9a-f]{64}", image) for image in chosen.values()):
            raise ValueError("Selected smoke requires exactly seven immutable local content IDs")
    else:
        chosen = {name: f"local/operix-{name}:" + (
            "candidate" if candidate_mode and name in ("postgres", "redis") else "test") for name in NAMES}
    images = {}
    for name, image in chosen.items():
        identity = runner(["docker", "image", "inspect", image, "--format", "{{.Id}}"], check=True,
                          capture_output=True, text=True).stdout.strip()
        if not re.fullmatch(r"sha256:[0-9a-f]{64}", identity) or (image_file and image != identity):
            raise ValueError("Smoke image content identity mismatch: " + name)
        images[name] = identity
    return images
