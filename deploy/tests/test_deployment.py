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


class DeploymentContracts(unittest.TestCase):
    def test_compose_is_private_and_scoped(self):
        env = {**os.environ, "ECR_REGISTRY": "000000000000.dkr.ecr.us-east-1.amazonaws.com",
               "IMAGE_TAG": "a" * 40 + "-1-1", "RELEASE_SHA": "a" * 40,
               "SECRETS_DIR": str(ROOT / "tmp/deployment-test-secrets"),
               "APP_URL": "https://operix.globalhightech.com", "MAIL_FROM": "test@operix.test",
               "SMTP_HOST": "smtp.test"}
        result = subprocess.run(["docker", "compose", "--profile", "release", "--profile", "worker-disabled",
                                 "-f", str(ROOT / "deploy/compose.yml"), "config", "--format", "json"],
                                env=env, capture_output=True, text=True, check=True)
        config = json.loads(result.stdout)
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

    def test_ssm_accepts_no_arbitrary_command(self):
        document = json.loads((ROOT / "deploy/aws/ssm-document.json").read_text())
        self.assertEqual(set(document["parameters"]), {"ReleaseId", "Checksum", "Mode"})
        for param in document["parameters"].values():
            self.assertEqual(param["interpolationType"], "ENV_VAR")
            self.assertTrue("allowedPattern" in param or "allowedValues" in param)
        template = json.loads((ROOT / "deploy/aws/operix-staging.template.json").read_text())
        self.assertFalse(any(r["Type"] in ["AWS::EC2::Instance", "AWS::Route53::RecordSet"] for r in template["Resources"].values()))
        for name in ["ImagesRole", "DeployRole"]:
            trust = template["Resources"][name]["Properties"]["AssumeRolePolicyDocument"]
            self.assertIn("repo:Kienda/Operix:environment:operix-", json.dumps(trust))


if __name__ == "__main__":
    unittest.main()
