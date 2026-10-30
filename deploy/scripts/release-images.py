#!/usr/bin/env python3
"""Build/scan all seven before any push; publication is separately approved on main."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
NAMES = ("api", "worker", "migrate", "web", "tunnel", "postgres", "redis")
SCANNER = "aquasec/trivy:0.61.1@sha256:91bcccab7cb503127b0d792db7c652c4e556c9ff30eeb0908b6ae1980d7727ad"
SUPPORT = ("postgres", "redis")
STORAGE = {"postgres": "16-alpine-uid70", "redis": "7.4-aof"}


def support_inputs():
    """Canonical LF checksums of every reviewed support build/startup input."""
    files = [ROOT / "deploy/docker/support.Dockerfile",
             ROOT / "deploy/docker/init-db.sh", ROOT / "deploy/docker/redis-start.sh"]
    files += sorted((ROOT / "deploy/docker/support").glob("*"))
    return {str(path.relative_to(ROOT)).replace("\\", "/"):
            hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()
            for path in files if path.is_file()}


def retained_support(registry):
    """Only a reviewed repository lock can select existing supporting artifacts."""
    lock = json.loads((ROOT / "deploy/support-images.lock.json").read_text())
    if (not isinstance(lock, dict) or set(lock) != {"schema", "source_release", "storage", "images", "build_inputs"}
            or type(lock["schema"]) is not int or lock["schema"] != 1
            or not isinstance(lock["source_release"], str)
            or not re.fullmatch(r"[0-9a-f]{40}-[0-9]+-[0-9]+", lock["source_release"])
            or lock["storage"] != STORAGE or not isinstance(lock["images"], dict)
            or set(lock["images"]) != set(SUPPORT) or lock["build_inputs"] != support_inputs()):
        raise ValueError("Invalid retained supporting-image lock or changed build/startup inputs; separate review required")
    for name, image in lock["images"].items():
        if not isinstance(image, str) or not re.fullmatch(re.escape(registry + "/operix-" + name) + r"@sha256:[0-9a-f]{64}", image):
            raise ValueError("Invalid retained supporting-image reference: " + name)
    return lock


def run(*args, capture=False):
    return subprocess.run(list(args), check=True, capture_output=capture, text=True).stdout


def scan(image):
    with tempfile.TemporaryDirectory(prefix="operix-release-scan-") as directory:
        archive = Path(directory) / "image.tar"
        run("docker", "save", image, "-o", str(archive))
        run("docker", "run", "--rm", "-v", f"{directory}:/scan:ro",
            "-v", f"{Path.home() / '.cache/trivy'}:/root/.cache/", SCANNER,
            "image", "--input", "/scan/image.tar", "--scanners", "vuln",
            "--severity", "HIGH,CRITICAL", "--exit-code", "1")


def build():
    revision = os.environ.get("GITHUB_SHA") or run("git", "rev-parse", "HEAD", capture=True).strip()
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("Invalid source commit")
    for name in NAMES:
        file = "support" if name in ("postgres", "redis") else (name if name in ("web", "tunnel") else "backend")
        target = name + "-candidate" if file == "support" else name
        run("docker", "build", "-f", f"deploy/docker/{file}.Dockerfile", "--target", target,
            "--label", "org.opencontainers.image.revision=" + revision,
            "-t", f"local/operix-{name}:test", ".")
        if file == "support":
            run("docker", "tag", f"local/operix-{name}:test", f"local/operix-{name}:candidate")
    # CI Compose and its scan gate use actual immutable local image IDs, never tags.
    images = {name: run("docker", "image", "inspect", f"local/operix-{name}:test", "--format", "{{.Id}}", capture=True).strip() for name in NAMES}
    if not all(re.fullmatch(r"sha256:[0-9a-f]{64}", image) for image in images.values()):
        raise ValueError("Unexpected local content identity")
    if os.environ.get("GITHUB_ENV"):
        with open(os.environ["GITHUB_ENV"], "a") as stream:
            for name, image in images.items():
                stream.write(f"{name.upper()}_IMAGE={image}\n")
    print(json.dumps(images, indent=2))


def scan_all(images=None):
    failures = []
    for name in NAMES:
        try:
            scan(images[name] if images is not None else f"local/operix-{name}:test")
        except subprocess.CalledProcessError:
            failures.append(name)
    if failures:
        raise subprocess.CalledProcessError(1, "Release image scan failed: " + ",".join(failures))


def publish(retain_support=False):
    if not (os.environ.get("CI") == "true" and os.environ.get("GITHUB_REF") == "refs/heads/main"
            and os.environ.get("OPERIX_SUPPORT_PUBLICATION_APPROVED") == "true"):
        raise SystemExit("Separate supporting-image publication approval on main is required")
    account = os.environ["ACCOUNT"]
    if not re.fullmatch(r"[0-9]{12}", account):
        raise ValueError("Invalid account")
    registry = account + ".dkr.ecr.us-east-1.amazonaws.com"
    release = "-".join(os.environ[k] for k in ("GITHUB_SHA", "GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT"))
    if not re.fullmatch(r"[0-9a-f]{40}-[0-9]+-[0-9]+", release):
        raise ValueError("Invalid release")
    lock = retained_support(registry) if retain_support else None
    # Full rebuild is verified again immediately before publication. No push may
    # precede the last successful scan, including failures of the scanner itself.
    build()
    run("python3", "deploy/tests/support_candidates_smoke.py")
    run("python3", "deploy/tests/smoke.py")
    run("python3", "deploy/tests/tunnel_smoke.py", "--image", "local/operix-tunnel:test")
    identities = {name: run("docker", "image", "inspect", f"local/operix-{name}:test", "--format", "{{.Id}}", capture=True).strip() for name in NAMES}
    scan_all()
    selected = {name: f"local/operix-{name}:test" for name in NAMES}
    images = dict(lock["images"]) if lock else {}
    if lock:
        for name, image in lock["images"].items():
            # Bind the retained digest to its recorded publication, not a mutable
            # environment override or an unverified locally tagged image.
            lookup = json.loads(run("aws", "ecr", "batch-get-image", "--region", "us-east-1",
                                    "--repository-name", "operix-" + name, "--image-ids", "imageTag=" + lock["source_release"],
                                    "--output", "json", capture=True))
            if (lookup.get("failures") or len(lookup.get("images", [])) != 1
                    or lookup["images"][0]["imageId"]["imageDigest"] != image.rsplit("@", 1)[1]):
                raise ValueError("Retained image differs from its recorded source release: " + name)
            run("docker", "pull", image)
            identities[name] = run("docker", "image", "inspect", image, "--format", "{{.Id}}", capture=True).strip()
            selected[name] = image
        if not all(re.fullmatch(r"sha256:[0-9a-f]{64}", image) for image in identities.values()):
            raise ValueError("Invalid selected image content identity")
        # Exercise precisely the selected content IDs with disposable databases.
        # Candidate smoke above remains mandatory and never substitutes for this.
        with tempfile.TemporaryDirectory(prefix="operix-selected-images-") as directory:
            file = Path(directory) / "images.json"
            file.write_text(json.dumps(identities), encoding="utf-8")
            run("python3", "deploy/tests/smoke.py", "--images-file", str(file))
        scan_all(identities)
    publishing = tuple(name for name in NAMES if name not in images)
    # BatchGetImage is already within the approved repository-scoped read policy.
    # Do not add DescribeImages or overwrite immutable release tags.
    for name in publishing:
        lookup = json.loads(run("aws", "ecr", "batch-get-image", "--region", "us-east-1",
                                "--repository-name", "operix-" + name, "--image-ids", "imageTag=" + release,
                                "--output", "json", capture=True))
        if lookup.get("images") or len(lookup.get("failures", [])) != 1 or lookup["failures"][0].get("failureCode") != "ImageNotFound":
            raise ValueError("Release tag already exists or its absence cannot be verified")
    for name in publishing:
        tagged = f"{registry}/operix-{name}:{release}"
        run("docker", "tag", identities[name] if lock else selected[name], tagged)
        run("docker", "push", tagged)
        lookup = json.loads(run("aws", "ecr", "batch-get-image", "--region", "us-east-1", "--repository-name", "operix-" + name,
                                "--image-ids", "imageTag=" + release, "--output", "json", capture=True))
        if lookup.get("failures") or len(lookup.get("images", [])) != 1:
            raise ValueError("Published tag readback failed")
        digest = lookup["images"][0]["imageId"]["imageDigest"]
        if not re.fullmatch(r"sha256:[0-9a-f]{64}", digest):
            raise ValueError("Invalid registry digest")
        images[name] = f"{registry}/operix-{name}@{digest}"
    # Verify published artifacts by digest before any deployment artifact upload.
    for name, image in images.items():
        run("docker", "pull", image)
        actual = run("docker", "image", "inspect", image, "--format", "{{.Id}}", capture=True).strip()
        if actual != identities[name]:
            raise ValueError("Registry artifact differs from locally tested image: " + name)
        scan(image)
    manifest = {"schema": 1, "release": release, "images": images, "storage": STORAGE}
    spec = importlib.util.spec_from_file_location("manifest", ROOT / "deploy/scripts/image-manifest.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.validate(manifest, registry, release)
    (ROOT / "deploy/images.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["build", "scan", "publish"])
    parser.add_argument("--retain-support", action="store_true",
                        help="Publish five application images while retaining the two reviewed supporting digests")
    args = parser.parse_args()
    if args.retain_support and args.action != "publish":
        parser.error("--retain-support is valid only for publication")
    if args.action == "build":
        build()
    elif args.action == "scan":
        scan_all()
    else:
        publish(retain_support=args.retain_support)
