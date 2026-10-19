#!/usr/bin/env python3
"""Render a self-contained, reviewable host bootstrap for the shared EC2 (run via SSM as root).

    python deploy/scripts/render-host-bootstrap.py > host-bootstrap.sh

Embeds the reviewed receiver, systemd units and staging.env (identifiers only, no secrets)
with SHA-256 checks. The output touches only Operix paths, one Operix-only firewall unit and
the AWS CLI snap: no Docker daemon settings, Tontin files, containers, networks or proxy.
"""
import base64
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STACK = "operix-staging"


def outputs():
    raw = subprocess.run(["aws", "cloudformation", "describe-stacks", "--region", "us-east-1", "--stack-name", STACK,
                          "--query", "Stacks[0].Outputs", "--output", "json"], capture_output=True, text=True, check=True)
    return {o["OutputKey"]: o["OutputValue"] for o in json.loads(raw.stdout)}


def staging_env(out):
    account = out["Registry"].split(".")[0]
    template = (ROOT / "deploy/host.env.example").read_text(encoding="utf-8")
    values = {"AWS_ACCOUNT_ID": account, "ARTIFACT_BUCKET": out["ArtifactsBucket"], "BACKUP_BUCKET": out["BackupsBucket"]}
    lines = []
    for line in template.splitlines():
        key = line.split("=", 1)[0]
        lines.append(f"{key}={values[key]}" if key in values else line)
    text = "\n".join(lines) + "\n"
    if "REPLACE_WITH" in text:
        sys.exit("host.env.example still has REPLACE_WITH placeholders that are not stack outputs")
    return text


def embed(path, content, mode):
    data = content.encode() if isinstance(content, str) else content
    # A Windows checkout may carry CRLF; bash and systemd on the host need LF.
    data = data.replace(b"\r\n", b"\n")
    digest = hashlib.sha256(data).hexdigest()
    b64 = base64.b64encode(data).decode()
    return (f"install_file {path} {mode} {digest} <<'B64'\n{b64}\nB64\n")


def main():
    out = outputs()
    files = [
        embed("/usr/local/libexec/operix-receive-release", (ROOT / "deploy/scripts/receive-release.sh").read_bytes(), "0755"),
        embed("/etc/operix/staging.env", staging_env(out), "0600"),
        embed("/etc/systemd/system/operix-imds-block.service", (ROOT / "deploy/systemd/operix-imds-block.service").read_bytes(), "0644"),
    ]
    script = f"""#!/usr/bin/env bash
# Operix restricted-staging host bootstrap (rendered {STACK}; review before running).
set -Eeuo pipefail
umask 077
[[ $EUID == 0 ]] || {{ echo 'Run as root'; exit 1; }}
install_file() {{  # path mode sha256 < base64
  local tmp; tmp=$(mktemp)
  base64 -d > "$tmp"
  echo "$3  $tmp" | sha256sum --check --status || {{ rm -f "$tmp"; echo "Checksum mismatch for $1"; exit 1; }}
  install -D -o root -g root -m "$2" "$tmp" "$1"; rm -f "$tmp"
  echo "installed $1"
}}

# Operix directories: root-owned, private. Only Operix paths are created or changed.
BASE=/opt/ght/apps/operix
[[ -z $(ls -A "$BASE" 2>/dev/null) ]] || [[ -d $BASE/releases ]] || {{ echo "$BASE is not empty; inspect it first"; exit 1; }}
install -d -o root -g root -m 0700 /etc/operix "$BASE" "$BASE/releases" "$BASE/backups"
install -d -o root -g root -m 0755 /usr/local/libexec

{''.join(files)}
# Deny the EC2 metadata service to Operix bridges now and at every boot (Tontin unaffected).
systemctl daemon-reload
systemctl enable --now operix-imds-block.service

# AWS CLI v2 from the signed snap (release receiver, ECR login, S3 backups).
command -v aws >/dev/null || snap install aws-cli --classic
aws --version

# Approval sentinel: without it the receiver, deploy and backup scripts refuse to run.
install -o root -g root -m 0600 /dev/null /etc/operix/staging.approved
echo 'Operix host bootstrap complete. Tontin was not touched.'
iptables -S DOCKER-USER
"""
    # Raw bytes: on Windows, text-mode stdout would turn every newline into CRLF.
    sys.stdout.buffer.write(script.encode())


if __name__ == "__main__":
    main()
