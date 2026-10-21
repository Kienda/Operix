"""Provenance and CI-only application-test boundary; no container startup."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]


class SupportingCandidateContracts(unittest.TestCase):
    def test_candidate_application_smoke_refuses_non_ci_execution(self):
        result = subprocess.run([sys.executable, str(ROOT / "deploy/tests/smoke.py")],
                                env={**os.environ, "CI": "false", "OPERIX_SUPPORT_CANDIDATES": "1"},
                                capture_output=True, text=True, timeout=15)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("only in disposable CI", result.stderr)

    def test_provenance_and_checksums_match_the_actual_build_inputs(self):
        directory = ROOT / "deploy/docker/support"
        provenance = json.loads((directory / "provenance.json").read_text())
        dockerfile = (ROOT / "deploy/docker/support.Dockerfile").read_text()
        for name, checksum in provenance["postgres"]["gosu"]["lock_sha256"].items():
            self.assertEqual(hashlib.sha256((directory / name).read_bytes()).hexdigest(), checksum)
        for line in (directory / "locks.sha256").read_text().splitlines():
            checksum, name = line.split()
            self.assertEqual(hashlib.sha256((directory / name).read_bytes()).hexdigest(), checksum)
        for package in provenance["redis"]["package_changes_only"]:
            self.assertIn("--checksum=sha256:" + package["sha256"], dockerfile)
            self.assertIn(package["url"], dockerfile)
        self.assertIn(provenance["postgres"]["base"], dockerfile)
        self.assertIn(provenance["redis"]["base"], dockerfile)
        self.assertIn(provenance["postgres"]["gosu"]["commit"], dockerfile)
        self.assertIn("--network=none --mount=from=redis-packages", dockerfile)
        commands = "\n".join(line for line in dockerfile.splitlines() if not line.startswith("#"))
        self.assertNotIn("--allow-untrusted", commands)
