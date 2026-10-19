#!/usr/bin/env python3
"""Create or update the Operix staging runtime secret without exposing any value.

    python deploy/scripts/create-runtime-secret.py            # create (generates DB/Redis/JWT)
    python deploy/scripts/create-runtime-secret.py --update   # change SMTP and/or tunnel token only

Database, Redis and JWT credentials are generated here with `secrets` and never shown.
Only values that cannot be generated are prompted for, without echo: the SMTP username
and password, and the Cloudflare Tunnel connector token. The payload is validated with the
same code the host uses, handed to the AWS CLI through a private temporary file (never a
command-line argument), and the file is overwritten and deleted afterwards.
"""
import argparse
import getpass
import importlib.util
import json
import os
import secrets
import subprocess
import sys
import tempfile
from pathlib import Path

NAME = "operix/staging/runtime"
KMS_KEY = "alias/operix-staging"
REGION = "us-east-1"
HERE = Path(__file__).resolve().parent

spec = importlib.util.spec_from_file_location("prepare_secrets", HERE / "prepare-secrets.py")
prepare_secrets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare_secrets)


def aws(*args, payload=None):
    """Run the AWS CLI; a payload is passed as file:// so it never appears in argv."""
    with tempfile.TemporaryDirectory() as private:
        argv = ["aws", "--region", REGION, *args]
        path = Path(private) / "secret.json"
        if payload is not None:
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write(payload)
            argv += ["--secret-string", f"file://{path}"]
        try:
            return subprocess.run(argv, capture_output=True, text=True)
        finally:
            if path.exists():
                path.write_text("0" * len(payload or ""), encoding="utf-8")
                path.unlink()


def ask(label, required=True):
    while True:
        value = getpass.getpass(f"{label} (input hidden{'' if required else ', Enter to skip'}): ").strip()
        if value or not required:
            return value or None


def validate(secret):
    # Exactly what the host will do at release time, into a throwaway directory.
    with tempfile.TemporaryDirectory() as scratch:
        prepare_secrets.prepare(secret, Path(scratch) / "runtime")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--update", action="store_true", help="keep generated credentials; replace SMTP and/or tunnel token")
    args = parser.parse_args()

    exists = aws("secretsmanager", "describe-secret", "--secret-id", NAME, "--query", "ARN", "--output", "text")
    if args.update:
        if exists.returncode != 0:
            sys.exit(f"{NAME} does not exist yet; run without --update first.")
        current = aws("secretsmanager", "get-secret-value", "--secret-id", NAME, "--query", "SecretString", "--output", "text")
        if current.returncode != 0:
            sys.exit("Unable to read the current secret (check your permissions).")
        secret = json.loads(current.stdout)
        print("Leave a field empty to keep its current value.")
        for key, label in [("SMTP_USER", "SMTP username"), ("SMTP_PASSWORD", "SMTP password / app password"),
                           ("CLOUDFLARE_TUNNEL_TOKEN", "Cloudflare Tunnel token")]:
            value = ask(label, required=False)
            if value:
                secret[key] = value
    else:
        if exists.returncode == 0:
            sys.exit(f"{NAME} already exists. Use --update; generated credentials are never replaced "
                     "here because existing PostgreSQL/Redis volumes keep the original passwords.")
        secret = {
            "DB_ADMIN_PASSWORD": secrets.token_hex(32),
            "DB_MIGRATE_PASSWORD": secrets.token_hex(32),
            "DB_APP_PASSWORD": secrets.token_hex(32),
            "REDIS_PASSWORD": secrets.token_hex(32),
            "JWT_ACCESS_SECRET": secrets.token_hex(48),
            "SMTP_USER": ask("SMTP username (e.g. the Google Workspace sender address)"),
            "SMTP_PASSWORD": ask("SMTP password (Google: a 16-character app password)"),
        }
        token = ask("Cloudflare Tunnel token", required=False)
        if token:
            secret["CLOUDFLARE_TUNNEL_TOKEN"] = token

    try:
        validate(secret)
    except ValueError as error:
        sys.exit(f"Not saved: {error}")
    fields = sorted(secret)
    payload = json.dumps(secret)
    if args.update:
        result = aws("secretsmanager", "put-secret-value", "--secret-id", NAME, payload=payload)
    else:
        result = aws("secretsmanager", "create-secret", "--name", NAME, "--kms-key-id", KMS_KEY,
                     "--description", "Operix restricted staging runtime credentials",
                     "--tags", "Key=Application,Value=Operix", "Key=Environment,Value=staging", payload=payload)
    del payload, secret
    if result.returncode != 0:
        # AWS CLI errors never echo the secret string; keep only the first line.
        sys.exit("AWS rejected the request: " + (result.stderr.strip().splitlines() or ["unknown error"])[-1])
    arn = json.loads(result.stdout).get("ARN", NAME)
    print(f"{'Updated' if args.update else 'Created'} {arn}")
    print("Fields stored (values not displayed):", ", ".join(fields))


if __name__ == "__main__":
    main()
