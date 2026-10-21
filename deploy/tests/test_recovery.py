"""Real Bash recovery functions with mocked Docker/AWS; no containers or network calls."""
import hashlib
import os
from pathlib import Path
import shlex
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


def unix_path(path):
    value = str(path.resolve()).replace('\\', '/')
    return '/mnt/' + value[0].lower() + value[2:] if os.name == 'nt' else value


class RecoveryFaultTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        probe = subprocess.run(['bash', '-c', 'printf recovery-bash-ready'], capture_output=True, text=True, timeout=20)
        if probe.returncode != 0 or probe.stdout != 'recovery-bash-ready':
            raise RuntimeError('A working local Bash is required; fault tests must not pass on shell startup failures')

    def setUp(self):
        (ROOT / 'tmp').mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / 'tmp')
        self.addCleanup(self.temp.cleanup)
        self.work = Path(self.temp.name)
        self.archive = self.work / 'input.dump'
        self.archive.write_bytes(b'PGDMP synthetic fixture archive')
        self.sha = hashlib.sha256(self.archive.read_bytes()).hexdigest()

    def run_bash(self, body, fault='none'):
        shell = '\n'.join([
            'set -Eeuo pipefail',
            'export TEST_DIR=' + shlex.quote(unix_path(self.work)),
            'export TMPDIR="$TEST_DIR"',
            'export FAULT=' + shlex.quote(fault),
            'source ' + shlex.quote(unix_path(ROOT / 'deploy/scripts/recovery-common.sh')),
            'source ' + shlex.quote(unix_path(ROOT / 'deploy/scripts/restore-common.sh')),
            'source ' + shlex.quote(unix_path(ROOT / 'deploy/scripts/recovery-workstation.sh')),
            body,
        ])
        path = self.work / 'test.sh'
        path.write_text(shell, encoding='utf-8', newline='\n')
        return subprocess.run(['bash', unix_path(path)], capture_output=True, text=True, timeout=40)

    def trace(self):
        path = self.work / 'trace'
        return path.read_text() if path.exists() else ''

    def backup(self, fault):
        return self.run_bash(r'''
compose() {
  printf 'compose %s\n' "$*" >> "$TEST_DIR/trace"
  if [[ $* == *pg_dump* ]]; then
    [[ $FAULT != empty ]] || return 0
    printf 'PGDMP synthetic fixture archive'
    [[ $FAULT != dump_failure ]] || return 1
  elif [[ $* == *pg_restore* ]]; then
    [[ $FAULT != invalid_archive ]] || return 1
  else return 9; fi
}
aws() {
  printf 'aws %s\n' "$*" >> "$TEST_DIR/trace"
  [[ $FAULT != upload_failure ]] || return 1
  local checksum=''
  while [[ $# -gt 0 ]]; do
    if [[ $1 == --checksum-sha256 ]]; then checksum=$2; fi
    shift
  done
  if [[ $FAULT == wrong_receipt ]]; then printf 'None\n'; else printf '%s\n' "$checksum"; fi
}
operix_create_backup "$TEST_DIR/final.dump" test-backup-bucket operix-staging/test.dump aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-1-1
printf 'next step permitted' > "$TEST_DIR/next-step"
''', fault)

    def test_backup_faults_fail_closed_and_remove_partial_files(self):
        for fault in ['dump_failure', 'empty', 'invalid_archive', 'upload_failure', 'wrong_receipt']:
            with self.subTest(fault=fault):
                (self.work / 'trace').unlink(missing_ok=True)
                result = self.backup(fault)
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertFalse((self.work / 'final.dump').exists())
                self.assertFalse((self.work / 'next-step').exists())
                self.assertEqual(list(self.work.glob('*.partial.*')), [])
                if fault in ['dump_failure', 'empty', 'invalid_archive']:
                    self.assertNotIn('aws ', self.trace())

    def test_backup_success_requires_archive_validation_encryption_and_matching_receipt(self):
        result = self.backup('none')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.work / 'final.dump').read_bytes(), self.archive.read_bytes())
        trace = self.trace()
        self.assertLess(trace.index('pg_restore --list'), trace.index('aws s3api put-object'))
        for required in ['--server-side-encryption AES256', '--checksum-algorithm SHA256',
                         '--checksum-sha256', '--if-none-match *', '--metadata sha256=' + self.sha]:
            self.assertIn(required, trace)
        self.assertEqual(list(self.work.glob('*.partial.*')), [])

    def test_existing_backup_is_not_overwritten_or_uploaded(self):
        (self.work / 'final.dump').write_text('existing evidence')
        result = self.backup('none')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.work / 'final.dump').read_text(), 'existing evidence')
        self.assertEqual(self.trace(), '')

    def restore(self, fault='none', checksum=None, fixture=False):
        checksum = self.sha if checksum is None else checksum
        return self.run_bash(r'''
docker() {
  printf 'docker %s\n' "$*" >> "$TEST_DIR/trace"
  case "$1" in
    image) [[ $FAULT != image_missing ]];;
    container) [[ $FAULT == name_collision ]];;
    create) [[ $FAULT != create_failure ]] || return 1; printf '%064d\n' 1;;
    start) [[ $FAULT != start_failure ]];;
    rm) [[ $FAULT != cleanup_failure ]];;
    exec)
      if [[ $* == *'/proc/1/comm'* ]]; then printf 'postgres\n';
      elif [[ $* == *pg_isready* ]]; then [[ $FAULT != readiness_failure ]];
      elif [[ $* == *'pg_restore --list'* ]]; then
        [[ $FAULT != list_failure ]] || return 1
        printf '1; 1259 16384 TABLE public operix_recovery_fixture postgres\n'
      elif [[ $* == *pg_restore* ]]; then [[ $FAULT != restore_failure ]];
      elif [[ $* == *psql* ]]; then
        [[ $FAULT != sql_failure ]] || return 1
        if [[ $* == *operix_recovery_fixture* ]]; then
          if [[ $FAULT == fixture_mismatch ]]; then printf '2|50.00|1\n'; else printf '3|60.00|3\n'; fi
        elif [[ $FAULT == empty_schema ]]; then printf '0\n'; else printf '1\n'; fi
      else return 8; fi;;
    *) return 9;;
  esac
}
sleep() { :; }
operix_restore_archive "$TEST_DIR/input.dump" ''' + shlex.quote(checksum) + ' postgres:16-bookworm@sha256:' + 'a' * 64 + (' synthetic-phase3b' if fixture else '') + r'''
printf 'verified' > "$TEST_DIR/next-step"
''', fault)

    def test_restore_rejects_missing_invalid_and_wrong_checksums_before_docker(self):
        for checksum in ['', 'None', 'A' * 64, 'f' * 64]:
            with self.subTest(checksum=checksum):
                result = self.restore(checksum=checksum)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(self.trace(), '')
                self.assertEqual(list(self.work.glob('tmp.*')), [])

    def test_restore_failures_cleanup_only_created_id_and_never_report_success(self):
        for fault in ['image_missing', 'name_collision', 'create_failure', 'start_failure',
                      'readiness_failure', 'list_failure', 'restore_failure', 'sql_failure',
                      'empty_schema', 'cleanup_failure']:
            with self.subTest(fault=fault):
                (self.work / 'trace').unlink(missing_ok=True)
                result = self.restore(fault)
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertFalse((self.work / 'next-step').exists())
                trace = self.trace()
                if fault in ['image_missing', 'name_collision', 'create_failure']:
                    self.assertNotIn('docker rm ', trace)
                else:
                    self.assertIn('docker rm -fv ' + '0' * 63 + '1', trace)
                if fault == 'readiness_failure':
                    self.assertNotIn('pg_restore', trace)
                if fault == 'list_failure':
                    self.assertNotIn('--exit-on-error', trace)
                self.assertEqual(list(self.work.glob('tmp.*')), [])

    def test_restore_success_is_network_isolated_and_cleanup_completes(self):
        result = self.restore()
        self.assertEqual(result.returncode, 0, result.stderr)
        trace = self.trace()
        for required in ['--network none', '--memory 512m', '--cpus 0.5', '--read-only',
                         '--cap-drop ALL', '--user 999:999', '--exit-on-error',
                         '--pull=never', '--tmpfs /var/lib/postgresql/data:', 'docker rm -fv']:
            self.assertIn(required, trace)
        self.assertNotIn('--publish', trace)
        self.assertEqual(list(self.work.glob('tmp.*')), [])

    def test_synthetic_rehearsal_checks_actual_restored_fixture_rows(self):
        success = self.restore(fixture=True)
        self.assertEqual(success.returncode, 0, success.stderr)
        (self.work / 'next-step').unlink()
        failure = self.restore('fixture_mismatch', fixture=True)
        self.assertNotEqual(failure.returncode, 0)
        self.assertFalse((self.work / 'next-step').exists())

    def test_readiness_rejects_temporary_initialization_server(self):
        result = self.run_bash(r'''
docker() {
  if [[ $* == *'/proc/1/comm'* ]]; then
    if [[ ! -f $TEST_DIR/initialized ]]; then printf 'bash\n'; else printf 'postgres\n'; fi
  elif [[ $* == *pg_isready* ]]; then
    [[ -f $TEST_DIR/initialized ]] || { printf 'premature' > "$TEST_DIR/premature"; return 1; }
  else return 9; fi
}
sleep() { touch "$TEST_DIR/initialized"; }
operix_wait_for_postgres synthetic
''')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.work / 'initialized').exists())
        self.assertFalse((self.work / 'premature').exists())

    def test_workstation_docker_preserves_binary_dump_bytes(self):
        result = self.run_bash(r'''
fixture_binary() {
  [[ $1 == --context && $2 == desktop-linux ]] || return 9
  printf 'PGDMP\r\000binary\r\n'
}
operix_workstation_docker fixture_binary exec synthetic pg_dump > "$TEST_DIR/stream"
''')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.work / 'stream').read_bytes(), b'PGDMP\r\x00binary\r\n')

    def test_workstation_aws_translates_body_without_shell_interpolation(self):
        result = self.run_bash(r'''
fixture_binary() { printf '%s\n' "$@" > "$TEST_DIR/trace"; printf 'receipt\r\n'; }
wslpath() { printf 'WIN:%s' "$2"; }
operix_workstation_aws fixture_binary s3api put-object --body "$TEST_DIR/name with spaces.dump" > "$TEST_DIR/receipt"
''')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('WIN:' + unix_path(self.work) + '/name with spaces.dump', self.trace())
        self.assertEqual((self.work / 'receipt').read_bytes(), b'receipt\n')


if __name__ == '__main__':
    unittest.main()
