#!/usr/bin/env python3
"""Operator-only, separately approved secret merge; no host or provider configuration changes.

Uses official AWS SDK with temporary credentials exported in memory by the AWS CLI
login provider. Never persists plaintext credentials or puts payloads in process argv.
"""
import base64
import importlib.util
import json
import subprocess
import sys
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('operix_schema', HERE / 'prepare-secrets.py')
schema = importlib.util.module_from_spec(spec)
spec.loader.exec_module(schema)
ACCOUNT = '471112967488'
CF_ACCOUNT = 'b0419cceb6d3335ba3c6dde196707b31'
TUNNEL = '9fc9647e-134d-4c9a-aaea-170a4170c896'
SECRET = 'operix/staging/runtime'


def merge_token(client, token):
    """Stage, read back, verify continuity, then move AWSCURRENT with old-version guard."""
    binding = json.loads(base64.b64decode(token, validate=True))
    if binding.get('a') != CF_ACCOUNT or binding.get('t') != TUNNEL or not binding.get('s'):
        raise ValueError('Connector token binding mismatch')
    metadata = client.describe_secret(SecretId=SECRET)
    if metadata.get('RotationEnabled') or metadata['Name'] != SECRET or metadata['ARN'].split(':')[4] != ACCOUNT:
        raise ValueError('Secret identity or rotation state needs review')
    previous = client.get_secret_value(SecretId=SECRET, VersionStage='AWSCURRENT')
    original = json.loads(previous['SecretString'])
    schema.validate(original)
    old_version = previous['VersionId']
    before = schema.credential_fingerprint(original)
    candidate = {**original, 'CLOUDFLARE_TUNNEL_TOKEN': token}
    schema.validate(candidate, require_tunnel=True)
    if candidate == original:
        return {'status': 'already_matches', 'credential_continuity_verified': True}
    version = str(uuid.uuid4())
    stage = 'OPERIX_PHASE3B_' + version.replace('-', '')
    client.put_secret_value(SecretId=SECRET, ClientRequestToken=version,
                            SecretString=json.dumps(candidate), VersionStages=[stage])
    readback = json.loads(client.get_secret_value(SecretId=SECRET, VersionId=version)['SecretString'])
    schema.validate(readback, require_tunnel=True)
    if readback != candidate or schema.credential_fingerprint(readback) != before:
        raise ValueError('Staged secret readback or credential continuity mismatch')
    # Do not overwrite a concurrent operator change. The API also requires the named
    # old version to own AWSCURRENT when RemoveFromVersionId is used.
    latest = client.describe_secret(SecretId=SECRET)
    if 'AWSCURRENT' not in latest.get('VersionIdsToStages', {}).get(old_version, []):
        raise ValueError('Current secret changed concurrently; staged version not promoted')
    client.update_secret_version_stage(SecretId=SECRET, VersionStage='AWSCURRENT',
                                       MoveToVersionId=version, RemoveFromVersionId=old_version)
    current = client.get_secret_value(SecretId=SECRET, VersionStage='AWSCURRENT')
    if current['VersionId'] != version or json.loads(current['SecretString']) != candidate:
        raise ValueError('Current-version readback mismatch; inspect version stages')
    client.update_secret_version_stage(SecretId=SECRET, VersionStage=stage, RemoveFromVersionId=version)
    return {'status': 'updated_verified', 'previous_version': old_version, 'current_version': version,
            'credential_continuity_verified': True, 'changed_field': 'CLOUDFLARE_TUNNEL_TOKEN'}


def main():
    if sys.argv[1:] != ['--approved-phase3b-write']:
        raise ValueError('Separate write approval is required')
    # boto3 is workstation tooling, never a runtime/backend dependency.
    import boto3
    from botocore.config import Config
    exported = subprocess.run(['aws', 'configure', 'export-credentials', '--profile', 'operix-staging',
                               '--format', 'process'], capture_output=True, text=True, check=True)
    credentials = json.loads(exported.stdout)
    exported = None
    session = boto3.Session(aws_access_key_id=credentials['AccessKeyId'],
                            aws_secret_access_key=credentials['SecretAccessKey'],
                            aws_session_token=credentials['SessionToken'], region_name='us-east-1')
    credentials = None
    config = Config(retries={'max_attempts': 2, 'mode': 'standard'}, connect_timeout=10, read_timeout=30)
    if session.client('sts', config=config).get_caller_identity()['Account'] != ACCOUNT:
        raise ValueError('AWS account mismatch')
    # Capture only the dedicated token from Windows' DPAPI credential-backed API call.
    provider = subprocess.run(['powershell.exe', '-NoProfile', '-File',
                               str(HERE / 'read-tunnel-token.ps1')], capture_output=True, text=True, check=True)
    token = provider.stdout.strip()
    provider = None
    result = merge_token(session.client('secretsmanager', config=config), token)
    token = None
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # SDK exceptions may include request payloads; never render them or a traceback.
        print('Secret merge stopped; inspect version metadata. Credentials and payload details withheld.', file=sys.stderr)
        sys.exit(1)
