#!/bin/sh
set -eu
# Runs once on an empty Operix-only volume; never mounts the development init SQL.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=migrate_password="$(cat /run/secrets/db_migrate_password)" \
  --set=app_password="$(cat /run/secrets/db_app_password)" <<'SQL'
CREATE ROLE operix_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD :'migrate_password';
CREATE ROLE operix_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD :'app_password';
ALTER DATABASE operix OWNER TO operix_migrator;
ALTER SCHEMA public OWNER TO operix_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE operix TO operix_app;
GRANT USAGE ON SCHEMA public TO operix_app;
ALTER DEFAULT PRIVILEGES FOR ROLE operix_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO operix_app;
ALTER DEFAULT PRIVILEGES FOR ROLE operix_migrator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO operix_app;
SQL
