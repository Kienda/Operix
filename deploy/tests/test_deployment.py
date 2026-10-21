import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("prepare_secrets", ROOT / "deploy/scripts/prepare-secrets.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SecretTests(unittest.TestCase):
    def test_pure_validation_requires_tunnel_without_writing_files(self):
        secret = self.secret()
        module.validate(secret)
        with self.assertRaises(ValueError):
            module.validate(secret, require_tunnel=True)
        with self.assertRaises(ValueError):
            module.validate([])
        with_token = {**secret, "CLOUDFLARE_TUNNEL_TOKEN": "A" * 180}
        module.validate(with_token, require_tunnel=True)
        self.assertEqual(module.credential_fingerprint(secret), module.credential_fingerprint(with_token))

    def secret(self):
        return {"DB_ADMIN_PASSWORD": "a" * 64, "DB_MIGRATE_PASSWORD": "b" * 64,
                "DB_APP_PASSWORD": "c" * 64, "REDIS_PASSWORD": "d" * 64,
                "JWT_ACCESS_SECRET": "e" * 96, "SMTP_USER": "test-user", "SMTP_PASSWORD": "test-provider-password"}

    def test_service_specific_secrets(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "runtime"
            secret = self.secret()
            module.prepare(secret, target)
            api = json.loads((target / "api.json").read_text())
            self.assertIn("operix_app:", api["DATABASE_URL"])
            self.assertNotIn(secret["DB_ADMIN_PASSWORD"], json.dumps(api))
            self.assertNotIn(secret["DB_MIGRATE_PASSWORD"], json.dumps(api))
            migration = json.loads((target / "migrate.json").read_text())
            self.assertEqual(set(migration), {"DATABASE_URL"})
            self.assertIn("operix_migrator:", migration["DATABASE_URL"])
            self.assertNotIn("JWT_ACCESS_SECRET", json.loads((target / "worker.json").read_text()))

    def test_rejects_reused_and_placeholder_secrets(self):
        for key, value in [("DB_ADMIN_PASSWORD", "GENERATE_64_HEX_CHARACTERS"), ("REDIS_PASSWORD", "a" * 64)]:
            with tempfile.TemporaryDirectory() as directory:
                with self.assertRaises(ValueError):
                    module.prepare({**self.secret(), key: value}, Path(directory))

    def test_fingerprint_tracks_database_credentials_only(self):
        with tempfile.TemporaryDirectory() as directory:
            values = []
            for i, changes in enumerate([{}, {"SMTP_PASSWORD": "rotated-provider"}, {"DB_APP_PASSWORD": "f" * 64}]):
                target = Path(directory) / str(i)
                module.prepare({**self.secret(), **changes}, target)
                values.append((target / "credential-fingerprint").read_text())
            self.assertEqual(values[0], values[1])
            self.assertNotEqual(values[0], values[2])

    def test_optional_tunnel_token(self):
        token = "eyJh" + "A" * 180
        with tempfile.TemporaryDirectory() as directory:
            without, with_token = Path(directory) / "a", Path(directory) / "b"
            module.prepare(self.secret(), without)
            self.assertFalse((without / "tunnel_token").exists())
            module.prepare({**self.secret(), "CLOUDFLARE_TUNNEL_TOKEN": token}, with_token)
            self.assertEqual((with_token / "tunnel_token").read_text(), token)
            # Adding or rotating the tunnel token is not a database credential rotation.
            self.assertEqual((without / "credential-fingerprint").read_text(),
                             (with_token / "credential-fingerprint").read_text())
            for bad in ["short", "has spaces " + "A" * 120]:
                with self.assertRaises(ValueError):
                    module.prepare({**self.secret(), "CLOUDFLARE_TUNNEL_TOKEN": bad}, Path(directory) / "c")
            with self.assertRaises(ValueError):
                module.prepare({**self.secret(), "UNEXPECTED": "x"}, Path(directory) / "d")


def compose_config(*overlays):
    env = {**os.environ, "ECR_REGISTRY": "000000000000.dkr.ecr.us-east-1.amazonaws.com",
           "IMAGE_TAG": "a" * 40 + "-1-1", "RELEASE_SHA": "a" * 40,
           "SECRETS_DIR": str(ROOT / "tmp/deployment-test-secrets"),
           "APP_URL": "https://operix.globalhightech.com", "MAIL_FROM": "test@operix.test",
           "SMTP_HOST": "smtp.test"}
    files = [arg for name in ("compose.yml", *overlays) for arg in ("-f", str(ROOT / "deploy" / name))]
    result = subprocess.run(["docker", "compose", "--profile", "release", "--profile", "worker-disabled",
                             *files, "config", "--format", "json"],
                            env=env, capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


class DeploymentContracts(unittest.TestCase):
    def test_compose_is_private_and_scoped(self):
        config = compose_config()
        self.assertEqual(config["name"], "operix-staging")
        services = config["services"]
        for name, service in services.items():
            if name != "web":
                self.assertNotIn("ports", service, name)
            self.assertIn("mem_limit", service, name)
            self.assertNotIn("container_name", service, name)
            self.assertTrue(all(mount.startswith('/') for mount in service.get('tmpfs', [])), name)
        self.assertTrue(all(p["host_ip"] == "127.0.0.1" for p in services["web"]["ports"]))
        self.assertTrue(config["networks"]["data"]["internal"])
        self.assertTrue(config["networks"]["queue"]["internal"])
        self.assertIn("worker-disabled", services["worker"]["profiles"])
        self.assertEqual(services["api"]["environment"]["SEED_DEMO_DATA"], "false")
        self.assertEqual(services["api"]["environment"]["OPERIX_MODULE_ALLOWLIST"], "core,crm,sales,projects")
        self.assertNotIn("edge", config["networks"])
        # The gateway passes X-Forwarded-For through; trusting more than one hop lets a client
        # choose the address used for rate limiting and audit.
        self.assertEqual(services["api"]["environment"]["TRUST_PROXY"], "1")
        # Only these bridges route outside; their names anchor the metadata-service block.
        bridges = {n: c.get("driver_opts", {}).get("com.docker.network.bridge.name") for n, c in config["networks"].items()}
        self.assertEqual({n for n, c in config["networks"].items() if not c.get("internal")}, {"ingress", "egress"})
        self.assertEqual((bridges["ingress"], bridges["egress"]), ("opx-ingress", "opx-egress"))
        deploy = (ROOT / "deploy/scripts/deploy.sh").read_text()
        for bridge in ("opx-ingress", "opx-egress"):
            self.assertIn(bridge, deploy)
            self.assertIn(bridge, (ROOT / "deploy/systemd/operix-imds-block.service").read_text())
        self.assertIn("-d 169.254.169.254 -j DROP", deploy)

    def test_tunnel_reaches_only_the_gateway(self):
        services = compose_config("compose.tunnel.yml")["services"]
        tunnel = services["tunnel"]
        self.assertNotIn("ports", tunnel)
        self.assertEqual(list(tunnel["networks"]), ["ingress"])
        self.assertIn("ingress", services["web"]["networks"])
        for name in ("api", "postgres", "redis"):
            self.assertNotIn("ingress", services[name]["networks"], name)
        self.assertTrue(tunnel["read_only"])
        self.assertEqual(tunnel["cap_drop"], ["ALL"])
        self.assertIn("--token-file", tunnel["command"])
        self.assertTrue(tunnel["image"].endswith("/operix-tunnel:" + "a" * 40 + "-1-1"))
        dockerfile = (ROOT / "deploy/docker/tunnel.Dockerfile").read_text()
        self.assertRegex(dockerfile, r"golang:1\.27\.3-bookworm@sha256:[0-9a-f]{64}")
        self.assertIn("ADD --checksum=sha256:", dockerfile)
        self.assertIn("GOTOOLCHAIN=local", dockerfile)
        self.assertIn("USER 65532:65532", dockerfile)

    def test_dockerfile_copy_sources_are_tracked(self):
        # CI builds from a clean checkout: an untracked or empty directory (git keeps no empty
        # directories) builds locally but fails there with '"/path": not found'.
        tracked = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split()
        for dockerfile in (ROOT / "deploy/docker").glob("*.Dockerfile"):
            for line in dockerfile.read_text().splitlines():
                parts = line.split()
                if not parts or parts[0] != "COPY" or any(p.startswith("--from") for p in parts):
                    continue
                for source in [p for p in parts[1:-1] if not p.startswith("--")]:
                    prefix = source.rstrip("/")
                    self.assertTrue(any(f == prefix or f.startswith(prefix + "/") for f in tracked),
                                    f"{dockerfile.name}: COPY source {source} is not tracked by git")

    def test_ssm_accepts_no_arbitrary_command(self):
        document = json.loads((ROOT / "deploy/aws/ssm-document.json").read_text())
        self.assertEqual(set(document["parameters"]), {"ReleaseId", "Checksum", "Mode"})
        for param in document["parameters"].values():
            self.assertEqual(param["interpolationType"], "ENV_VAR")
            self.assertTrue("allowedPattern" in param or "allowedValues" in param)
        template = json.loads((ROOT / "deploy/aws/operix-staging.template.json").read_text())
        self.assertFalse(any(r["Type"] in ["AWS::EC2::Instance", "AWS::Route53::RecordSet"] for r in template["Resources"].values()))
        for name, environment in [("ImagesRole", "operix-images"), ("DeployRole", "operix-staging")]:
            trust = template["Resources"][name]["Properties"]["AssumeRolePolicyDocument"]
            self.assertEqual(trust["Statement"][0]["Condition"], {"StringEquals": {
                "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
                "token.actions.githubusercontent.com:sub": f"repo:Kienda@62873841/Operix@1423912038:environment:{environment}",
            }})
        repos = {r["Properties"]["RepositoryName"] for r in template["Resources"].values() if r["Type"] == "AWS::ECR::Repository"}
        self.assertEqual(repos, {f"operix-{n}" for n in ("api", "worker", "migrate", "web", "tunnel")})


if __name__ == "__main__":
    unittest.main()
