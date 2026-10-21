#!/usr/bin/env python3
"""Disposable synthetic compatibility checks; never attaches existing volumes."""
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
POSTGRES = "local/operix-postgres:candidate"
REDIS = "local/operix-redis:candidate"
OLD_POSTGRES = "postgres:16-bookworm@sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4"
OLD_REDIS = "redis:7.4-alpine@sha256:858f009f9709ce576febc734aa78b8f6d624b82571f9ddb6bda4377c833b3499"


class Scratch:
    def __init__(self, work):
        self.work = work
        self.token = uuid.uuid4().hex
        self.containers = []
        self.volumes = []
        self.docker = ["docker"] + (["--context", "desktop-linux"] if os.name == "nt" else [])
        host = os.environ.get("DOCKER_HOST", "")
        if os.name != "nt" and host and not host.startswith("unix://"):
            raise RuntimeError("Remote Docker engines are forbidden")
        endpoint = self.text(["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"])
        if not (endpoint.startswith("unix://") or endpoint == "npipe:////./pipe/dockerDesktopLinuxEngine"):
            raise RuntimeError("Expected a local Docker engine")
        self.password = work / "synthetic-password"
        self.password.write_text(secrets.token_hex(32))
        self.password.chmod(0o444)
        self.redis_script = work / "redis-start.sh"
        self.redis_script.write_bytes((ROOT / "deploy/docker/redis-start.sh").read_bytes().replace(b"\r\n", b"\n"))
        self.redis_script.chmod(0o444)

    def run(self, args, *, data=None, check=True):
        result = subprocess.run([*self.docker, *args], input=data, capture_output=True, timeout=180)
        if check and result.returncode:
            raise RuntimeError(f"Scratch Docker {args[0]} failed; provider output withheld")
        return result

    def text(self, args):
        return self.run(args).stdout.decode("utf-8").strip()

    def volume(self, suffix):
        name = f"operix-support-{self.token}-{suffix}"
        if self.run(["volume", "inspect", name], check=False).returncode == 0:
            raise RuntimeError("Scratch volume collision; existing volume untouched")
        created = self.text(["volume", "create", "--label", f"operix.validation.run={self.token}", name])
        if created != name:
            raise RuntimeError("Unexpected scratch volume identity")
        self.volumes.append(name)
        return name

    def start(self, image, volume, service):
        name = f"operix-support-{self.token}-{service}-{uuid.uuid4().hex[:8]}"
        args = ["create", "--name", name, "--label", f"operix.validation.run={self.token}",
                "--network", "none", "--memory", "512m", "--cpus", "0.5", "--pids-limit", "128",
                "--read-only", "--security-opt", "no-new-privileges:true",
                "--tmpfs", "/tmp:rw,nosuid,noexec,size=32m,mode=1777"]
        if service == "postgres":
            args += ["--tmpfs", "/var/run/postgresql:rw,nosuid,noexec,size=4m,mode=1777",
                     "--mount", f"type=volume,src={volume},dst=/var/lib/postgresql/data",
                     "--mount", f"type=bind,src={self.password},dst=/run/secrets/test_password,readonly",
                     "-e", "POSTGRES_PASSWORD_FILE=/run/secrets/test_password",
                     "-e", "POSTGRES_DB=operix_fixture"]
        else:
            args += ["--tmpfs", "/run/operix:rw,nosuid,noexec,size=1m,mode=1777",
                     "--mount", f"type=volume,src={volume},dst=/data",
                     "--mount", f"type=bind,src={self.password},dst=/run/secrets/redis_password,readonly",
                     "--mount", f"type=bind,src={self.redis_script},dst=/opt/operix/redis-start.sh,readonly"]
        args += [image] + (["sh", "/opt/operix/redis-start.sh"] if service == "redis" else [])
        identity = self.text(args)
        if not re.fullmatch(r"[0-9a-f]{64}", identity):
            raise RuntimeError("Unexpected scratch container ID")
        self.containers.append(identity)
        self.run(["start", identity])
        for _ in range(90):
            if service == "postgres":
                comm = self.run(["exec", identity, "cat", "/proc/1/comm"], check=False)
                ready = comm.stdout.strip() == b"postgres" and self.run(
                    ["exec", identity, "pg_isready", "-U", "postgres", "-d", "operix_fixture"], check=False).returncode == 0
            else:
                ready = self.redis(identity, "PING", check=False).stdout.strip() == b"PONG"
            if ready:
                return identity
            time.sleep(1)
        raise RuntimeError("Scratch readiness timed out")

    def stop(self, identity):
        if identity not in self.containers:
            raise RuntimeError("Only recorded scratch container IDs may be removed")
        self.run(["stop", "--time", "30", identity])
        self.run(["rm", "-fv", identity])
        self.containers.remove(identity)

    def sql(self, identity, query):
        return self.text(["exec", identity, "psql", "-U", "postgres", "-d", "operix_fixture",
                          "-v", "ON_ERROR_STOP=1", "-Atc", query])

    def redis(self, identity, *args, check=True):
        return self.run(["exec", identity, "sh", "-c",
                         'REDISCLI_AUTH="$(cat /run/secrets/redis_password)" exec redis-cli --raw "$@"',
                         "synthetic-fixture", *args], check=check)

    def cleanup(self):
        failed = False
        for identity in reversed(self.containers):
            failed = bool(self.run(["rm", "-fv", identity], check=False).returncode) or failed
        for volume in reversed(self.volumes):
            owner = self.run(["volume", "inspect", "--format", '{{index .Labels "operix.validation.run"}}', volume], check=False)
            if owner.returncode or owner.stdout.decode().strip() != self.token:
                failed = True  # Never remove a volume whose ownership cannot be verified.
                continue
            failed = bool(self.run(["volume", "rm", volume], check=False).returncode) or failed
        if failed:
            (ROOT / "tmp" / f"support-candidate-cleanup-{self.token}.json").write_text(
                json.dumps({"owner": self.token, "containers": self.containers, "volumes": self.volumes}))
            raise RuntimeError("Scratch cleanup incomplete; inspect recorded resources")


def exercise(s):
    for image in (POSTGRES, REDIS):
        s.run(["image", "inspect", image])  # Never substitute a missing candidate.
    for image in (OLD_POSTGRES, OLD_REDIS):
        s.run(["pull", image])  # Historical images are test fixtures only, never deployment choices.
    source_volume, target_volume = s.volume("pg-source"), s.volume("pg-target")
    source = s.start(OLD_POSTGRES, source_volume, "postgres")
    s.sql(source, "CREATE TABLE recovery_fixture(id integer PRIMARY KEY, label text UNIQUE, amount numeric(12,2), synthetic boolean CHECK(synthetic)); "
          "INSERT INTO recovery_fixture VALUES(1,'SYNTHETIC-é',10,true),(2,'SYNTHETIC-ع',20,true),(3,'SYNTHETIC-three',30,true)")
    dump = s.run(["exec", source, "pg_dump", "-U", "postgres", "-d", "operix_fixture", "-Fc"]).stdout
    if not dump.startswith(b"PGDMP"):
        raise RuntimeError("Invalid custom backup")
    s.stop(source)  # Retain its volume until final cleanup; never mount it under Alpine.
    target = s.start(POSTGRES, target_volume, "postgres")
    if "16.15" not in s.text(["exec", target, "postgres", "--version"]):
        raise RuntimeError("Unexpected PostgreSQL version")
    if "go1.27.3" not in s.text(["exec", target, "gosu", "--version"]):
        raise RuntimeError("Unpatched gosu toolchain")
    s.run(["exec", "-i", target, "pg_restore", "--list"], data=dump)
    s.run(["exec", "-i", target, "pg_restore", "-U", "postgres", "-d", "operix_fixture",
           "--no-owner", "--no-privileges", "--exit-on-error"], data=dump)
    expected = "1|SYNTHETIC-é|10.00\n2|SYNTHETIC-ع|20.00\n3|SYNTHETIC-three|30.00"
    if s.sql(target, "SELECT id,label,amount FROM recovery_fixture ORDER BY id") != expected:
        raise RuntimeError("Logical restore fixture differs")
    s.sql(target, "INSERT INTO recovery_fixture VALUES(4,'SYNTHETIC-four',40,true)")
    candidate_dump = s.run(["exec", target, "pg_dump", "-U", "postgres", "-d", "operix_fixture", "-Fc"]).stdout
    s.run(["exec", "-i", target, "pg_restore", "--list"], data=candidate_dump)
    s.run(["exec", target, "createdb", "-U", "postgres", "operix_candidate_restore"])
    s.run(["exec", "-i", target, "pg_restore", "-U", "postgres", "-d", "operix_candidate_restore",
           "--no-owner", "--no-privileges", "--exit-on-error"], data=candidate_dump)
    if s.text(["exec", target, "psql", "-U", "postgres", "-d", "operix_candidate_restore", "-Atc",
               "SELECT count(*),sum(amount) FROM recovery_fixture"]) != "4|100.00":
        raise RuntimeError("Candidate-produced backup restore differs")
    s.stop(target)
    target = s.start(POSTGRES, target_volume, "postgres")
    if s.sql(target, "SELECT count(*),sum(amount),count(*) FILTER(WHERE synthetic) FROM recovery_fixture") != "4|100.00|4":
        raise RuntimeError("PostgreSQL restart persistence differs")
    s.stop(target)
    volume = s.volume("redis")
    old = s.start(OLD_REDIS, volume, "redis")
    s.redis(old, "MSET", "operix:fixture:one", "SYNTHETIC-é", "operix:fixture:two", "SYNTHETIC-ع")
    s.redis(old, "INCRBY", "operix:fixture:counter", "7")
    s.redis(old, "SAVE")
    s.stop(old)
    current = s.start(REDIS, volume, "redis")
    if "v=7.4.11" not in s.text(["exec", current, "redis-server", "--version"]):
        raise RuntimeError("Unexpected Redis version")
    if s.redis(current, "MGET", "operix:fixture:one", "operix:fixture:two").stdout.decode().strip() != "SYNTHETIC-é\nSYNTHETIC-ع":
        raise RuntimeError("Redis data differs after image change")
    if "NOAUTH" not in s.text(["exec", current, "redis-cli", "PING"]):
        raise RuntimeError("Redis authentication is not enforced")
    if b"aof_enabled:1" not in s.redis(current, "INFO", "persistence").stdout:
        raise RuntimeError("Redis AOF persistence is disabled")
    if s.redis(current, "INCRBY", "operix:fixture:counter", "13").stdout.strip() != b"20":
        raise RuntimeError("Redis counter continuity differs")
    s.redis(current, "SAVE")
    s.stop(current)
    current = s.start(REDIS, volume, "redis")
    if s.redis(current, "GET", "operix:fixture:counter").stdout.strip() != b"20":
        raise RuntimeError("Redis restart persistence differs")
    s.stop(current)
    return {"postgres_bookworm_logical_restore": True, "unicode_decimal_fixture": True,
            "postgres_candidate_dump_restore": True, "postgres_candidate_restart": True,
            "redis_same_volume_compatibility": True,
            "redis_auth_aof_restart": True, "source_dump_sha256": hashlib.sha256(dump).hexdigest(),
            "candidate_dump_sha256": hashlib.sha256(candidate_dump).hexdigest(),
            "existing_volumes_attached": False, "application_migrations_run": False}


def main():
    (ROOT / "tmp").mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="support-candidate-", dir=ROOT / "tmp") as directory:
        s = Scratch(Path(directory))
        try:
            result = exercise(s)
        finally:
            try:
                s.cleanup()
            finally:
                s.password.chmod(0o600)
                s.redis_script.chmod(0o600)
        result["scratch_cleanup_verified"] = True
        print(json.dumps(result))


if __name__ == "__main__":
    main()
