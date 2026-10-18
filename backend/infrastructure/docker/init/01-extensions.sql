-- Operix database bootstrap.
-- Runs once on first container start, before any Prisma migration.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Low-privilege application role. The API connects as this role for all
-- request-scoped work so that PostgreSQL Row-Level Security is enforced even
-- if an application-layer tenant filter is ever missed. Migrations and the
-- seed script use the owner role instead.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'operix_app') THEN
    CREATE ROLE operix_app LOGIN PASSWORD 'operix_app' NOBYPASSRLS;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE operix TO operix_app;
GRANT USAGE ON SCHEMA public TO operix_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO operix_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO operix_app;
