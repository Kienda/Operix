"""Security gate tests: fake processes only, no registry/cloud/container calls."""
from pathlib import Path
import subprocess
import unittest

from scan_support_images import SCANNER, scan_images


class SupportingImageGateTests(unittest.TestCase):
    def test_candidate_scans_require_local_images_without_registry_fallback(self):
        calls = []

        def runner(args, **kwargs):
            calls.append(args)
            return subprocess.CompletedProcess(args, 0)

        self.assertEqual(scan_images({n: f"local/operix-{n}:candidate" for n in ("postgres", "redis")},
                                     Path("/private-scan"), runner, pull=False), 0)
        self.assertFalse(any(args[1] == "pull" for args in calls))
        self.assertEqual(sum(args[1:3] == ["image", "inspect"] for args in calls), 2)

    def run_gate(self, fault=None):
        calls = []

        def runner(args, **kwargs):
            calls.append(args)
            phase = args[1]
            image = args[2] if phase in ("pull", "save") else args[args.index("--input") + 1]
            code = 1 if fault == (phase, "postgres") and "postgres" in image else 0
            return subprocess.CompletedProcess(args, code)

        code = scan_images({"postgres": "postgres:16-bookworm", "redis": "redis:7.4-alpine"},
                           Path("/private-scan"), runner)
        return code, calls

    def test_all_images_use_the_exact_threshold_and_scanner(self):
        code, calls = self.run_gate()
        self.assertEqual(code, 0)
        scans = [args for args in calls if args[1] == "run"]
        self.assertEqual(len(scans), 2)
        for args in scans:
            self.assertIn(SCANNER, args)
            self.assertEqual(args[args.index("--severity") + 1], "HIGH,CRITICAL")
            self.assertEqual(args[args.index("--exit-code") + 1], "1")
            self.assertNotIn("--ignore-unfixed", args)

    def test_pull_save_and_vulnerability_failures_fail_closed_but_check_other_image(self):
        for phase in ("pull", "save", "run"):
            with self.subTest(phase=phase):
                code, calls = self.run_gate((phase, "postgres"))
                self.assertEqual(code, 1)
                self.assertTrue(any(args[1] == "run" and "/scan/redis.tar" in args for args in calls))
