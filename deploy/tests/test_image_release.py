"""Release provenance, immutable references, data continuity and publish fail-closed tests."""
import copy
import importlib.util
import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "deploy/scripts" / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


manifest = load("image-manifest")
release = load("release-images")
storage = load("support-storage")
REGISTRY = "471112967488.dkr.ecr.us-east-1.amazonaws.com"
RELEASE = "a" * 40 + "-1-1"


def fixture():
    return {"schema": 1, "release": RELEASE,
            "images": {n: REGISTRY + "/operix-" + n + "@sha256:" + "b" * 64 for n in manifest.NAMES},
            "storage": {"postgres": "16-alpine-uid70", "redis": "7.4-aof"}}


class ImageReleaseContracts(unittest.TestCase):
    def test_manifest_rejects_tags_wrong_account_repository_missing_images_and_format_changes(self):
        good = fixture()
        self.assertEqual(manifest.validate(good, REGISTRY, RELEASE), good)
        mutations = [lambda m: m["images"].pop("postgres"),
                     lambda m: m["images"].update(redis=REGISTRY + "/operix-redis:latest"),
                     lambda m: m["images"].update(postgres=REGISTRY + "/operix-api@sha256:" + "b" * 64),
                     lambda m: m["images"].update(redis=m["images"]["redis"].replace("471112967488", "000000000000")),
                     lambda m: m.update(release="b" * 40 + "-1-1"),
                     lambda m: m["storage"].update(postgres="16-bookworm-uid999")]
        for change in mutations:
            broken = copy.deepcopy(good)
            change(broken)
            with self.assertRaises(ValueError):
                manifest.validate(broken, REGISTRY, RELEASE)

    def test_storage_refuses_unknown_volumes_image_change_and_silent_reinitialization(self):
        good = fixture()
        desired = storage.check(good, None, set())
        self.assertEqual(storage.check(good, desired, set(storage.VOLUMES)), desired)
        for existing in ({storage.VOLUMES[0]}, set(storage.VOLUMES)):
            with self.assertRaises(ValueError):
                storage.check(good, None, existing)
        with self.assertRaises(ValueError):
            storage.check(good, desired, set())
        changed = fixture()
        changed["images"]["postgres"] = changed["images"]["postgres"].replace("b" * 64, "c" * 64)
        with self.assertRaises(ValueError):
            storage.check(changed, desired, set(storage.VOLUMES))

    def test_scan_failure_for_each_image_prevents_every_push(self):
        env = {"CI": "true", "GITHUB_REF": "refs/heads/main", "OPERIX_SUPPORT_PUBLICATION_APPROVED": "true",
               "ACCOUNT": "471112967488", "GITHUB_SHA": "a" * 40, "GITHUB_RUN_ID": "1", "GITHUB_RUN_ATTEMPT": "1"}
        for failed_name in release.NAMES:
            def fail(image):
                if image == f"local/operix-{failed_name}:test":
                    raise subprocess.CalledProcessError(1, "Trivy")
            with self.subTest(image=failed_name), patch.dict(os.environ, env), patch.object(release, "build"), \
                    patch.object(release, "scan", side_effect=fail), patch.object(release, "run") as runner:
                with self.assertRaises(subprocess.CalledProcessError):
                    release.publish()
                self.assertFalse(any(call.args[:2] == ("docker", "push") for call in runner.call_args_list))

    def test_publication_refuses_without_separate_approval_or_from_pr(self):
        for ref, approval in [("refs/heads/main", "false"), ("refs/pull/10/merge", "true")]:
            with patch.dict(os.environ, {"CI": "true", "GITHUB_REF": ref, "OPERIX_SUPPORT_PUBLICATION_APPROVED": approval}), \
                    patch.object(release, "run") as runner:
                with self.assertRaises(SystemExit):
                    release.publish()
                runner.assert_not_called()

    def test_workflow_requires_all_security_jobs_and_separate_publication_approval(self):
        workflow = (ROOT / ".github/workflows/operix.yml").read_text()
        publish = workflow.split("  publish:", 1)[1].split("  staging:", 1)[0]
        for name in ("verify", "security", "images"):
            self.assertIn(f"needs.{name}.result == 'success'", publish)
        self.assertIn("vars.OPERIX_SUPPORT_PUBLICATION_APPROVED == 'true'", publish)
        self.assertNotIn("always()", publish)
        self.assertIn("--severity", (ROOT / "deploy/scripts/release-images.py").read_text())
