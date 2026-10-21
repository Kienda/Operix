#!/usr/bin/env python3
"""Exercise the actual Linux release images on a disposable Compose project."""
import importlib.util
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("prepare", ROOT / "deploy/scripts/prepare-secrets.py")
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)
candidate_mode = os.environ.get("OPERIX_SUPPORT_CANDIDATES") == "1"
if candidate_mode and os.environ.get("CI") != "true":
    raise SystemExit("Candidate application/migration smoke runs only in disposable CI")
project = "operix-support-image-smoke" if candidate_mode else "operix-image-smoke"
with tempfile.TemporaryDirectory(prefix="operix-smoke-") as directory:
    target = Path(directory) / "runtime"
    secret = {k: secrets.token_hex(48) for k in ["DB_ADMIN_PASSWORD", "DB_MIGRATE_PASSWORD", "DB_APP_PASSWORD", "REDIS_PASSWORD", "JWT_ACCESS_SECRET"]}
    secret.update(SMTP_USER="smoke-only", SMTP_PASSWORD=secrets.token_hex(32))
    prepare.prepare(secret, target)
    env = {**os.environ, "ECR_REGISTRY": "local", "IMAGE_TAG": os.environ.get("SMOKE_TAG", "test"),
           "RELEASE_SHA": "a" * 40, "SECRETS_DIR": str(target),
           "APP_URL": "https://operix.globalhightech.com", "MAIL_FROM": "test@operix.test",
           "SMTP_HOST": "unused.invalid", "OPERIX_HTTP_PORT": "18081"}
    for name in ("api", "worker", "migrate", "web", "tunnel", "postgres", "redis"):
        local = f"local/operix-{name}:" + ("candidate" if candidate_mode and name in ("postgres", "redis") else "test")
        env[name.upper() + "_IMAGE"] = subprocess.run(
            ["docker", "image", "inspect", local, "--format", "{{.Id}}"], check=True,
            capture_output=True, text=True).stdout.strip()
    command = ["docker", "compose", "-p", project, "-f", str(ROOT / "deploy/compose.yml")]

    def compose(*args, capture=False):
        return subprocess.run([*command, *args], env=env, check=True, capture_output=capture, text=True)
    if compose("ps", "-a", "-q", capture=True).stdout.strip():
        raise SystemExit("An image smoke project already exists; refusing to change it")
    try:
        if candidate_mode:
            subprocess.run(["docker", "image", "inspect", "local/operix-postgres:candidate",
                            "local/operix-redis:candidate"], check=True, capture_output=True)

        compose("up", "-d", "--pull", "never", "--wait", "postgres", "redis")
        compose("--profile", "release", "run", "--rm", "--no-deps", "--pull", "never", "migrate")
        compose("up", "-d", "--pull", "never", "--wait", "--wait-timeout", "180", "api", "web")
        for attempt in range(20):
            try:
                with urllib.request.urlopen("http://127.0.0.1:18081/healthz", timeout=2) as response:
                    if response.status == 200:
                        break
            except OSError:
                time.sleep(.25)
        for path in ["/healthz", "/api/v1/health", "/api/v1/health/live", "/", "/tasks/direct-link"]:
            with urllib.request.urlopen("http://127.0.0.1:18081" + path, timeout=10) as response:
                assert response.status == 200, path
        with urllib.request.urlopen("http://127.0.0.1:18081/api/v1/health") as response:
            assert json.load(response)["database"] == "connected"
        # A fresh deployment must contain no seed identities or business data.
        result = compose("exec", "-T", "postgres", "psql", "-U", "operix_admin", "-d", "operix", "-Atc",
                         'SELECT (SELECT count(*) FROM "User") + (SELECT count(*) FROM "Organization")', capture=True)
        assert result.stdout.strip() == "0", "Unexpected seeded accounts"
        result = compose("exec", "-T", "postgres", "psql", "-U", "operix_admin", "-d", "operix", "-Atc",
                         "SELECT rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls FROM pg_roles WHERE rolname='operix_app'", capture=True)
        assert result.stdout.strip() == "f", "Application database role is privileged"
        # The API role may append audit rows but never rewrite them or touch migration history.
        result = compose("exec", "-T", "postgres", "psql", "-U", "operix_admin", "-d", "operix", "-Atc",
                         "SELECT has_table_privilege('operix_app','\"AuditLog\"','INSERT'), "
                         "has_table_privilege('operix_app','\"AuditLog\"','UPDATE') OR has_table_privilege('operix_app','\"AuditLog\"','DELETE'), "
                         "has_table_privilege('operix_app','_prisma_migrations','SELECT')", capture=True)
        assert result.stdout.strip() == "t|f|f", f"Audit log/migration privileges not hardened: {result.stdout.strip()}"
        with urllib.request.urlopen("http://127.0.0.1:18081/", timeout=10) as response:
            for header in ["Content-Security-Policy", "Strict-Transport-Security", "X-Frame-Options", "X-Content-Type-Options"]:
                assert response.headers.get(header), f"Missing security header {header}"
        # The production bootstrap runs under the least-privilege role; a dry run writes nothing.
        result = compose("exec", "-T", "api", "node", "--require", "/opt/operix/runtime-env.cjs", "dist/cli/bootstrap-pilot.js",
                         "--owner-email", "owner@operix.test", "--dry-run", capture=True)
        assert "DRY RUN" in result.stdout and "GHT Guinea" in result.stdout, result.stdout
        result = compose("exec", "-T", "postgres", "psql", "-U", "operix_admin", "-d", "operix", "-Atc",
                         'SELECT count(*) FROM "Organization"', capture=True)
        assert result.stdout.strip() == "0", "Bootstrap dry run wrote data"
        services = compose("ps", "--services", capture=True).stdout.splitlines()
        assert "worker" not in services
        print("PASS: Linux images, private database, migrations, SPA/API routing, readiness, no seed accounts, "
              "append-only audit log, security headers and production bootstrap dry run")
    finally:
        compose("down", "--volumes")  # Only this uniquely named, disposable local test project.
        if os.name == 'nt':
            for path in target.iterdir():
                path.chmod(0o600)  # Permit tempfile cleanup of Windows read-only test files.
