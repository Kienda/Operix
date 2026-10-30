"""Retained database artifacts remain scanned, exercised, immutable and fail closed."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[2]


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


release = load("retained_release", "deploy/scripts/release-images.py")
smoke = load("smoke_images", "deploy/tests/smoke_images.py")
storage = load("retained_storage", "deploy/scripts/support-storage.py")
REGISTRY = "471112967488.dkr.ecr.us-east-1.amazonaws.com"
LOCK = json.loads((ROOT / "deploy/support-images.lock.json").read_text())
ENV = {"CI": "true", "GITHUB_REF": "refs/heads/main", "OPERIX_SUPPORT_PUBLICATION_APPROVED": "true",
       "ACCOUNT": "471112967488", "GITHUB_SHA": "a" * 40, "GITHUB_RUN_ID": "1", "GITHUB_RUN_ATTEMPT": "1"}


class RetainedSupportContracts(unittest.TestCase):
    def test_lock_pins_live_digests_and_unchanged_build_and_startup_inputs(self):
        self.assertEqual(release.retained_support(REGISTRY), LOCK)
        self.assertEqual(LOCK["source_release"], "2d899cb8f3eab63f2b197a7e04e2efb8aa9ff7a5-39704047009-2")
        self.assertTrue(LOCK["images"]["postgres"].endswith("@sha256:33341234955a890b4832395d16100bcc1bfd0812a38012e8d81b7404bc6eddf9"))
        self.assertTrue(LOCK["images"]["redis"].endswith("@sha256:6aa8592b54375bb6c6a1f9f5030d62ce2349f51a59ca4a7dfe7df1da7bf571d5"))
        self.assertEqual(LOCK["build_inputs"], release.support_inputs())

    def test_lock_rejects_tags_account_repository_schema_storage_and_input_changes(self):
        mutations = [lambda m: m.update(schema=True), lambda m: m.update(source_release="main"),
                     lambda m: m["images"].pop("redis"), lambda m: m["images"].update(extra="x"),
                     lambda m: m["storage"].update(postgres="17"),
                     lambda m: m["images"].update(redis=REGISTRY + "/operix-redis:latest"),
                     lambda m: m["images"].update(postgres=m["images"]["redis"]),
                     lambda m: m["images"].update(redis=m["images"]["redis"].replace("471112967488", "000000000000")),
                     lambda m: m["build_inputs"].update({"deploy/docker/support.Dockerfile": "0" * 64}),
                     lambda m: m.update(unreviewed=True)]
        for mutation in mutations:
            invalid = copy.deepcopy(LOCK)
            mutation(invalid)
            with self.subTest(mutation=mutation), patch.object(Path, "read_text", return_value=json.dumps(invalid)):
                with self.assertRaises(ValueError):
                    release.retained_support(REGISTRY)
        with patch.object(Path, "read_text", return_value="[]"), self.assertRaises(ValueError):
            release.retained_support(REGISTRY)

    def publication(self, fault=None):
        events, emitted, selected_smokes, lookups = [], [], [], {}
        ids = {name: "sha256:" + str(index + 1) * 64 for index, name in enumerate(release.NAMES)}
        ids.update(postgres="sha256:" + "8" * 64, redis="sha256:" + "9" * 64)
        original_write = Path.write_text

        def write(path, value, *args, **kwargs):
            if path == ROOT / "deploy/images.json":
                emitted.append(json.loads(value))
                return len(value)
            return original_write(path, value, *args, **kwargs)

        def runner(*args, **kwargs):
            events.append(args)
            if args[:3] == ("aws", "ecr", "batch-get-image"):
                name = args[args.index("--repository-name") + 1].removeprefix("operix-")
                if "imageTag=" + LOCK["source_release"] in args:
                    digest = LOCK["images"][name].rsplit("@", 1)[1]
                    if fault == "source-readback-" + name:
                        digest = "sha256:" + "0" * 64
                    return json.dumps({"images": [{"imageId": {"imageDigest": digest}}], "failures": []})
                lookups[name] = lookups.get(name, 0) + 1
                if lookups[name] == 1:
                    return json.dumps({"images": [], "failures": [{"failureCode": "ImageNotFound"}]})
                return json.dumps({"images": [{"imageId": {"imageDigest": "sha256:" + "b" * 64}}], "failures": []})
            if args[:2] == ("docker", "pull") and any(
                    fault == "retained-pull-" + name and args[2] == LOCK["images"][name] for name in release.SUPPORT):
                raise subprocess.CalledProcessError(1, "pull")
            if args[:3] == ("docker", "image", "inspect"):
                name = next(name for name in release.NAMES if "operix-" + name in args[3])
                if fault == "published-readback" and "@sha256:" + "b" * 64 in args[3]:
                    return "sha256:" + "0" * 64
                return ids[name]
            if args[:2] == ("python3", "deploy/tests/smoke.py") and "--images-file" in args:
                selected_smokes.append(json.loads(Path(args[-1]).read_text()))
                if fault == "selected-smoke":
                    raise subprocess.CalledProcessError(1, "smoke")
            if ((fault == "candidate-smoke" and args[:2] == ("python3", "deploy/tests/support_candidates_smoke.py"))
                    or (fault == "built-smoke" and args == ("python3", "deploy/tests/smoke.py"))
                    or (fault == "tunnel-smoke" and args[:2] == ("python3", "deploy/tests/tunnel_smoke.py"))):
                raise subprocess.CalledProcessError(1, "smoke")
            return ""

        def scan(image):
            events.append(("scan", image))
            if (fault in release.NAMES and image == ids[fault]) or any(
                    fault == "candidate-scan-" + name and image == f"local/operix-{name}:test" for name in release.NAMES):
                raise subprocess.CalledProcessError(1, "Trivy")

        error = None
        with patch.dict(os.environ, ENV), patch.object(release, "build", side_effect=(
                subprocess.CalledProcessError(1, "build") if fault == "build" else None)), patch.object(release, "scan", side_effect=scan), \
                patch.object(release, "run", side_effect=runner), patch.object(Path, "write_text", autospec=True, side_effect=write):
            try:
                release.publish(retain_support=True)
            except (ValueError, subprocess.CalledProcessError) as caught:
                error = caught
        return events, emitted, selected_smokes, ids, error

    def test_publication_tests_all_selected_images_before_five_pushes_and_retains_storage_identity(self):
        events, emitted, selected_smokes, ids, error = self.publication()
        self.assertIsNone(error)
        self.assertEqual(selected_smokes, [ids])
        first_push = next(index for index, args in enumerate(events) if args[:2] == ("docker", "push"))
        self.assertTrue(all(("scan", identity) in events[:first_push] for identity in ids.values()))
        self.assertEqual(sum(args[:2] == ("docker", "push") for args in events), 5)
        self.assertEqual({args[2].split("/operix-", 1)[1].split(":", 1)[0] for args in events if args[:2] == ("docker", "push")},
                         set(release.NAMES) - set(release.SUPPORT))
        self.assertEqual(sum(args[0] == "scan" for args in events), 21)
        self.assertEqual(len(emitted), 1)
        self.assertEqual({n: emitted[0]["images"][n] for n in release.SUPPORT}, LOCK["images"])
        recorded = {"storage": LOCK["storage"], "images": LOCK["images"]}
        self.assertEqual(storage.check(emitted[0], recorded, set(storage.VOLUMES)), recorded)

    def test_every_selected_scan_and_prepublication_failure_prevents_all_pushes(self):
        for fault in (*release.NAMES, *("candidate-scan-" + n for n in release.NAMES), "build",
                      *("source-readback-" + n for n in release.SUPPORT),
                      *("retained-pull-" + n for n in release.SUPPORT),
                      "candidate-smoke", "built-smoke", "tunnel-smoke", "selected-smoke"):
            with self.subTest(fault=fault):
                events, emitted, _, _, error = self.publication(fault)
                self.assertIsNotNone(error)
                self.assertFalse(any(args[:2] == ("docker", "push") for args in events))
                self.assertEqual(emitted, [])

    def test_registry_content_readback_failure_prevents_release_manifest(self):
        _, emitted, _, _, error = self.publication("published-readback")
        self.assertIsInstance(error, ValueError)
        self.assertEqual(emitted, [])

    def test_workflow_selects_retention_without_removing_candidate_security_gates(self):
        workflow = (ROOT / ".github/workflows/operix.yml").read_text()
        self.assertIn("python3 deploy/scripts/release-images.py publish --retain-support", workflow)
        images_job = workflow.split("  images:", 1)[1].split("  publish:", 1)[0]
        for command in ("release-images.py build", "release-images.py scan", "scan_support_images.py",
                        "support_candidates_smoke.py", "OPERIX_SUPPORT_CANDIDATES=1", "scan_support_images.py --candidates"):
            self.assertIn(command, images_job)


class SelectedSmokeContracts(unittest.TestCase):
    def test_selected_exact_ids_are_inspected_without_tag_substitution(self):
        selected = {name: "sha256:" + str(index + 1) * 64 for index, name in enumerate(smoke.NAMES)}
        runner = Mock(side_effect=lambda args, **kwargs: SimpleNamespace(stdout=args[3]))
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"CI": "true"}):
            file = Path(directory) / "selected.json"
            file.write_text(json.dumps(selected))
            self.assertEqual(smoke.select_images(file, runner=runner), selected)
            self.assertEqual([call.args[0][3] for call in runner.call_args_list], list(selected.values()))
            with self.assertRaises(ValueError):
                smoke.select_images(file, candidate_mode=True, runner=runner)
            runner.return_value = SimpleNamespace(stdout="sha256:" + "0" * 64)
            runner.side_effect = None
            with self.assertRaises(ValueError):
                smoke.select_images(file, runner=runner)

    def test_selected_smoke_rejects_non_ci_missing_images_tags_and_bad_ids_before_docker(self):
        runner = Mock()
        with patch.dict(os.environ, {"CI": "false"}), self.assertRaises(SystemExit):
            smoke.select_images("unused.json", runner=runner)
        for invalid in ([], {}, {n: "local/operix-" + n + ":test" for n in smoke.NAMES}):
            with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"CI": "true"}):
                file = Path(directory) / "invalid.json"
                file.write_text(json.dumps(invalid))
                with self.assertRaises(ValueError):
                    smoke.select_images(file, runner=runner)
        runner.assert_not_called()

    def test_selected_smoke_inspect_failure_has_no_fallback(self):
        selected = {name: "sha256:" + "a" * 64 for name in smoke.NAMES}
        runner = Mock(side_effect=subprocess.CalledProcessError(1, "inspect"))
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"CI": "true"}):
            file = Path(directory) / "selected.json"
            file.write_text(json.dumps(selected))
            with self.assertRaises(subprocess.CalledProcessError):
                smoke.select_images(file, runner=runner)
        runner.assert_called_once()
