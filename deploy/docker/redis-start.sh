#!/bin/sh
set -eu
umask 077
password=$(cat /run/secrets/redis_password)
case "$password" in *[!A-Za-z0-9]*|'') echo 'Redis password must be alphanumeric' >&2; exit 1;; esac
printf 'bind 0.0.0.0\nprotected-mode yes\nappendonly yes\nmaxmemory 160mb\nmaxmemory-policy noeviction\nrequirepass %s\n' "$password" > /run/operix/redis.conf
chown redis:redis /run/operix/redis.conf
exec /usr/local/bin/docker-entrypoint.sh redis-server /run/operix/redis.conf
