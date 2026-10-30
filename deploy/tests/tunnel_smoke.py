"""Isolated cloudflared checks; --quick explicitly enables a temporary public nonce-only origin."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import tempfile
import time
import urllib.request
import uuid


def docker(*args, check=True):
    return subprocess.run(["docker", *args], check=check, capture_output=True, text=True).stdout


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", default="local/operix-tunnel:patched")
    parser.add_argument("--quick", action="store_true")
    args = parser.parse_args()
    image = args.image
    info = json.loads(docker("image", "inspect", image))[0]
    assert info["Config"]["User"] == "65532:65532"
    assert "2026.10.2-operix.2" in docker("run", "--rm", "--network", "none", image, "--version")
    with tempfile.TemporaryDirectory(prefix="operix-tunnel-check-") as temp:
        root = Path(temp)
        # These fixtures contain no secrets; the non-root image must traverse the bind mount.
        root.chmod(0o755)
        config = root / "config.yml"
        config.write_text("ingress:\n  - hostname: smoke.invalid\n    service: http://origin:8080\n  - service: http_status:404\n")
        config.chmod(0o644)
        base = ["run", "--rm", "--network", "none", "--read-only", "--cap-drop=ALL",
                "--security-opt=no-new-privileges:true", "-v", f"{root}:/check:ro", image,
                "tunnel", "--config", "/check/config.yml", "ingress"]
        assert "OK" in docker(*base, "validate")
        assert "smoke.invalid" in docker(*base, "rule", "https://smoke.invalid/test")
        config.write_text("ingress:\n  - hostname: smoke.invalid\n    service: http://origin:8080\n")
        invalid = subprocess.run(["docker", *base, "validate"], capture_output=True)
        assert invalid.returncode != 0, "Invalid ingress configuration accepted"
        # Preserve the actual token-file command path without using any real credential.
        (root / "token").write_text("synthetic-invalid-token")
        (root / "token").chmod(0o644)
        invalid = subprocess.run(["docker", "run", "--rm", "--network", "none", "-v", f"{root}:/check:ro",
                                  image, "tunnel", "run", "--token-file", "/check/token"], capture_output=True, timeout=30)
        assert invalid.returncode != 0, "Invalid token accepted"
    print("PASS non-root version, valid/invalid configuration, routing and token-file failure checks", flush=True)
    if not args.quick:
        return
    prefix = "operix-tunnel-check-" + uuid.uuid4().hex[:12]
    origin, tunnel = prefix + "-origin", prefix + "-connector"
    nonce = uuid.uuid4().hex
    try:
        docker("network", "create", prefix)
        script = "require('http').createServer((q,s)=>s.end('" + nonce + "')).listen(8080,'0.0.0.0')"
        docker("run", "-d", "--name", origin, "--network", prefix, "--network-alias", "origin",
               "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges:true", "--user", "65532:65532",
               "node:24-trixie-slim@sha256:7f486cabe892bff8fef04c0f7da8dba84a560be3e4e2740b7a86afc57ebec315",
               "node", "-e", script)
        docker("run", "-d", "--name", tunnel, "--network", prefix, "--read-only", "--cap-drop=ALL",
               "--security-opt=no-new-privileges:true", image, "tunnel", "--url", "http://origin:8080")
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            logs = docker("logs", tunnel, check=False)
            # Docker writes cloudflared logs to stderr.
            logs += subprocess.run(["docker", "logs", tunnel], capture_output=True, text=True).stderr
            match = re.search(r"https://[-a-z0-9]+\.trycloudflare\.com", logs)
            if match:
                try:
                    with urllib.request.urlopen(match.group(), timeout=8) as response:
                        assert response.read().decode() == nonce
                    print("PASS temporary Quick Tunnel: HTTPS edge-to-origin nonce roundtrip", flush=True)
                    break
                except (OSError, AssertionError):
                    pass
            time.sleep(2)
        else:
            raise RuntimeError("Quick Tunnel connectivity did not pass within 120 seconds")
    finally:
        docker("rm", "-f", tunnel, origin, check=False)
        docker("network", "rm", prefix, check=False)


if __name__ == "__main__":
    main()
