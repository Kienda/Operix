#!/usr/bin/env python3
"""Scan the actual Compose PostgreSQL/Redis references without starting services."""
import json
import os
import re
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
SCANNER = "aquasec/trivy:0.61.1@sha256:91bcccab7cb503127b0d792db7c652c4e556c9ff30eeb0908b6ae1980d7727ad"


def configured_images():
    # Syntax-only rendering: no runtime secret is read or materialized.
    env = {**os.environ, "ECR_REGISTRY": "local", "IMAGE_TAG": "validation",
           "RELEASE_SHA": "a" * 40, "SECRETS_DIR": "/unused-validation-secrets",
           "APP_URL": "https://operix.globalhightech.com", "MAIL_FROM": "test@operix.test",
           "SMTP_HOST": "unused.invalid"}
    result = subprocess.run(["docker", "compose", "-f", str(ROOT / "deploy/compose.yml"),
                             "config", "--format", "json"], env=env, check=True,
                            capture_output=True, text=True)
    services = json.loads(result.stdout)["services"]
    images = {name: services[name]["image"] for name in ("postgres", "redis")}
    for name, image in images.items():
        local = re.fullmatch(r"sha256:[0-9a-f]{64}", image)
        if local and os.environ.get("CI") != "true":
            raise ValueError("Local content IDs are for disposable CI only")
        if not local and not re.fullmatch(r"[0-9]{12}\.dkr\.ecr\.us-east-1\.amazonaws\.com/operix-" + name + r"@sha256:[0-9a-f]{64}", image):
            raise ValueError("Supporting images must use immutable approved ECR references")
    return images


def scan_images(images, directory, runner=subprocess.run, *, pull=True):
    """Every image must pass; pull/save/scanner failures all fail the gate."""
    failed = False
    for name in ("postgres", "redis"):
        image = images[name]
        archive = directory / (name + ".tar")
        print(f"Supporting image scan: {name} = {image}", flush=True)
        lookup = ["docker", "pull", image] if pull else ["docker", "image", "inspect", image]
        if runner(lookup, check=False).returncode:
            failed = True
            continue
        if runner(["docker", "save", image, "-o", str(archive)], check=False).returncode:
            failed = True
            continue
        result = runner(["docker", "run", "--rm", "-v", f"{directory}:/scan:ro",
                         "-v", f"{Path.home() / '.cache/trivy'}:/root/.cache/",
                         SCANNER, "image", "--input", f"/scan/{name}.tar",
                         "--scanners", "vuln", "--severity", "HIGH,CRITICAL",
                         "--exit-code", "1"], check=False)
        failed = bool(result.returncode) or failed
    return 1 if failed else 0


def main():
    if sys.argv[1:] not in ([], ["--candidates"]):
        raise SystemExit("Use no arguments for production references, or --candidates for local test builds")
    candidates = sys.argv[1:] == ["--candidates"]
    images = ({name: f"local/operix-{name}:candidate" for name in ("postgres", "redis")}
              if candidates else configured_images())
    with tempfile.TemporaryDirectory(prefix="operix-support-scan-") as directory:
        return scan_images(images, Path(directory).resolve(), pull=not candidates and not all(re.fullmatch(r"sha256:[0-9a-f]{64}", image) for image in images.values()))


if __name__ == "__main__":
    raise SystemExit(main())
