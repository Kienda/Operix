#!/usr/bin/env python3
"""Retrieve only the approved Operix secret and materialize service-specific files."""
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote


def prepare(secret, target):
    required = {"DB_ADMIN_PASSWORD", "DB_MIGRATE_PASSWORD", "DB_APP_PASSWORD", "REDIS_PASSWORD", "JWT_ACCESS_SECRET", "SMTP_USER", "SMTP_PASSWORD"}
    if set(secret) != required or any(not isinstance(v, str) or not v for v in secret.values()):
        raise ValueError("Secret must have exactly the documented nonempty fields")
    for key in required - {"SMTP_USER", "SMTP_PASSWORD"}:
        if not re.fullmatch(r"[A-Fa-f0-9]{64,128}", secret[key]):
            raise ValueError("Database, Redis and JWT values must be independently generated hex secrets")
    if len({secret[k] for k in required - {"SMTP_USER", "SMTP_PASSWORD"}}) != 5:
        raise ValueError("Independent credentials are required")
    if any(re.search(r"GENERATE_|SET_PROVIDER|REPLACE_", v) for v in secret.values()):
        raise ValueError("Placeholder credentials are forbidden")
    target.mkdir(mode=0o700, parents=True, exist_ok=True)
    def save(name, value):
        path = target / name
        path.write_text(value, encoding="utf-8")
        # Docker Compose file secrets are bind mounts; the host directory is 0700.
        # Read permission on each mounted file permits the non-root container UID.
        path.chmod(0o444)
    for field, filename in [("DB_ADMIN_PASSWORD", "db_admin_password"), ("DB_MIGRATE_PASSWORD", "db_migrate_password"), ("DB_APP_PASSWORD", "db_app_password"), ("REDIS_PASSWORD", "redis_password")]:
        save(filename, secret[field])
    def url(user, key):
        return f"postgresql://{user}:{quote(secret[key], safe='')}@postgres:5432/operix?schema=public&connection_limit=8"
    save("api.json", json.dumps({"DATABASE_URL": url("operix_app", "DB_APP_PASSWORD"), **{k: secret[k] for k in ["JWT_ACCESS_SECRET", "SMTP_USER", "SMTP_PASSWORD"]}}))
    save("migrate.json", json.dumps({"DATABASE_URL": url("operix_migrator", "DB_MIGRATE_PASSWORD")}))
    save("worker.json", json.dumps({"DATABASE_URL": url("operix_app", "DB_APP_PASSWORD"), "REDIS_URL": f"redis://:{secret['REDIS_PASSWORD']}@redis:6379/0"}))
    # Detect password rotations before touching existing persistent databases.
    stable = {k: secret[k] for k in sorted(required) if k.startswith("DB_") or k == "REDIS_PASSWORD"}
    save("credential-fingerprint", hashlib.sha256(json.dumps(stable, sort_keys=True).encode()).hexdigest())


if __name__ == "__main__":
    try:
        result = subprocess.run(["aws", "secretsmanager", "get-secret-value", "--region", "us-east-1", "--secret-id", os.environ["SECRET_ID"], "--query", "SecretString", "--output", "text"], capture_output=True, text=True, check=True)
        prepare(json.loads(result.stdout), Path(sys.argv[1]))
    except Exception:
        # Never put provider output or credential values into SSM/GitHub logs.
        print("Unable to prepare Operix secrets; check secret schema and instance permissions.", file=sys.stderr)
        sys.exit(1)
