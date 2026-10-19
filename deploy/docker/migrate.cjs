'use strict';
const { spawnSync } = require('node:child_process');
const cli = require.resolve('prisma/build/index.js', { paths: [process.cwd()] });
const env = { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: '1' };
const result = spawnSync(process.execPath, [cli, 'migrate', 'deploy'], { stdio: 'inherit', env });
if (result.status !== 0) process.exit(result.status ?? 1);

// Least privilege after every successful migration (runs as the table owner):
// the API role can append to the audit log but never rewrite or delete it, and
// cannot touch Prisma's migration history. No-op where the role does not exist.
const hardening = `
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'operix_app') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "AuditLog" FROM operix_app;
    GRANT SELECT, INSERT ON TABLE "AuditLog" TO operix_app;
    REVOKE ALL ON TABLE "_prisma_migrations" FROM operix_app;
  END IF;
END $$;`;
const harden = spawnSync(
  process.execPath,
  [cli, 'db', 'execute', '--stdin', '--schema', 'prisma/schema.prisma'],
  { input: hardening, stdio: ['pipe', 'inherit', 'inherit'], env },
);
if (harden.status !== 0) {
  console.error('Post-migration privilege hardening failed; refusing to report success.');
  process.exit(harden.status ?? 1);
}
console.log('Post-migration privilege hardening applied.');
