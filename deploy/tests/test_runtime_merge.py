"""No AWS calls; exercise staging, concurrency and credential preservation with a fake SDK."""
import base64
import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('tunnel_merge', ROOT / 'deploy/scripts/set-tunnel-token.py')
merge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(merge)


def fixture():
    return {'DB_ADMIN_PASSWORD': 'a' * 64, 'DB_MIGRATE_PASSWORD': 'b' * 64,
            'DB_APP_PASSWORD': 'c' * 64, 'REDIS_PASSWORD': 'd' * 64,
            'JWT_ACCESS_SECRET': 'e' * 96, 'SMTP_USER': 'synthetic@operix.test',
            'SMTP_PASSWORD': 'synthetic-provider-password'}


def token(tunnel=None):
    return base64.b64encode(json.dumps({'a': merge.CF_ACCOUNT, 't': tunnel or merge.TUNNEL,
                                       's': 'synthetic-fixture-only-' + 'x' * 32}).encode()).decode()


class SecretsClient:
    def __init__(self, fault='none'):
        self.original = fixture()
        self.current = 'old-version'
        self.values = {self.current: copy.deepcopy(self.original)}
        self.fault = fault
        self.puts = []
        self.moves = []

    def describe_secret(self, **kwargs):
        owner = 'concurrent-version' if self.fault == 'race' and self.puts else self.current
        return {'Name': merge.SECRET, 'ARN': 'arn:aws:secretsmanager:us-east-1:471112967488:secret:synthetic-fixture',
                'RotationEnabled': self.fault == 'rotation', 'VersionIdsToStages': {owner: ['AWSCURRENT']}}

    def get_secret_value(self, **kwargs):
        version = kwargs.get('VersionId', self.current)
        value = copy.deepcopy(self.values[version])
        if self.fault == 'tamper' and version != 'old-version':
            value['DB_APP_PASSWORD'] = 'f' * 64
        return {'VersionId': version, 'SecretString': json.dumps(value)}

    def put_secret_value(self, **kwargs):
        if self.fault == 'put_failure':
            raise RuntimeError('simulated write failure')
        self.puts.append(kwargs)
        self.values[kwargs['ClientRequestToken']] = json.loads(kwargs['SecretString'])

    def update_secret_version_stage(self, **kwargs):
        self.moves.append(kwargs)
        if kwargs['VersionStage'] == 'AWSCURRENT':
            if kwargs['RemoveFromVersionId'] != self.current:
                raise RuntimeError('stale current version')
            self.current = kwargs['MoveToVersionId']


class RuntimeMergeTests(unittest.TestCase):
    def test_success_preserves_every_original_value_and_stages_before_promotion(self):
        client = SecretsClient()
        result = merge.merge_token(client, token())
        self.assertEqual(result['status'], 'updated_verified')
        self.assertTrue(result['credential_continuity_verified'])
        new = client.values[client.current]
        self.assertEqual({k: v for k, v in new.items() if k != 'CLOUDFLARE_TUNNEL_TOKEN'}, client.original)
        self.assertNotIn('AWSCURRENT', client.puts[0]['VersionStages'])
        self.assertEqual(client.moves[0]['RemoveFromVersionId'], 'old-version')
        self.assertNotIn(token(), json.dumps(result))

    def test_existing_matching_token_does_not_write(self):
        client = SecretsClient()
        client.values[client.current]['CLOUDFLARE_TUNNEL_TOKEN'] = token()
        result = merge.merge_token(client, token())
        self.assertEqual(result['status'], 'already_matches')
        self.assertEqual(client.puts, [])
        self.assertEqual(client.moves, [])

    def test_faults_never_promote_an_unverified_or_stale_version(self):
        for fault in ['put_failure', 'tamper', 'race', 'rotation']:
            with self.subTest(fault=fault):
                client = SecretsClient(fault)
                with self.assertRaises(Exception):
                    merge.merge_token(client, token())
                self.assertEqual(client.current, 'old-version')
                self.assertEqual(client.moves, [])
                self.assertEqual(client.values['old-version'], client.original)

    def test_wrong_tunnel_is_rejected_before_reading_or_writing_secret(self):
        client = SecretsClient()
        with self.assertRaises(ValueError):
            merge.merge_token(client, token('00000000-0000-0000-0000-000000000000'))
        self.assertEqual(client.puts, [])
        self.assertEqual(client.moves, [])


if __name__ == '__main__':
    unittest.main()
