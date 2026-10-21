#!/usr/bin/env python3
"""Scan the actual Compose PostgreSQL/Redis references without starting services."""
import json
import os
from pathlib import Path
import subprocess
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
    return {name: services[name]["image"] for name in ("postgres", "redis")}


def scan_images(images, directory, runner=subprocess.run):
    """Every image must pass; pull/save/scanner failures all fail the gate."""
    failed = False
    for name in ("postgres", "redis"):
        image = images[name]
        archive = directory / (name + ".tar")
        print(f"Supporting image scan: {name} = {image}", flush=True)
        if runner(["docker", "pull", image], check=False).returncode:
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
    images = configured_images()
    with tempfile.TemporaryDirectory(prefix="operix-support-scan-") as directory:
        return scan_images(images, Path(directory).resolve())


if __name__ == "__main__":
    raise SystemExit(main())
