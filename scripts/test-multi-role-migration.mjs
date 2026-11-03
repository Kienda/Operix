// Applies historical SQL and the additive migration only inside a disposable local schema.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const req = createRequire(resolve('backend/packages/database/package.json'));
const { PrismaClient } = req('@prisma/client');
const url = new URL(process.env.TEST_DATABASE_URL ?? parseEnv(readFileSync('backend/.env', 'utf8')).DATABASE_URL);
if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw Error('Local PostgreSQL required');
const schema = `multi_role_migration_${randomUUID().replaceAll('-', '')}`;
url.searchParams.set('schema', schema);
const db = new PrismaClient({ datasourceUrl: url.toString() });
const sql = (input) => execFileSync(process.execPath, [req.resolve('prisma/build/index.js'), 'db', 'execute', '--stdin', '--url', url.toString()], { input: `SET search_path TO "${schema}";\n${input}`, stdio: ['pipe', 'pipe', 'pipe'] });
try {
  await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const migrations = 'backend/packages/database/prisma/migrations';
  for (const name of readdirSync(migrations).filter((n) => /^20/.test(n) && n < '20261103120000').sort()) sql(readFileSync(`${migrations}/${name}/migration.sql`, 'utf8'));
  const [org, user, role, member, session, foreignOrg, foreignRole] = Array.from({ length: 7 }, randomUUID);
  sql(`INSERT INTO "Organization" (id,name,slug,"updatedAt") VALUES ('${org}','GHT SYNTHETIC','${schema}',now()), ('${foreignOrg}','Other SYNTHETIC','${schema}_other',now());
    INSERT INTO "User" (id,email,"passwordHash","firstName","lastName","updatedAt") VALUES ('${user}','migration@synthetic.test','unused','Synthetic','Migration',now());
    INSERT INTO "Role" (id,"organizationId",name,permissions,"updatedAt") VALUES ('${role}','${org}','Employee',ARRAY['tasks.view'],now()), ('${foreignRole}','${foreignOrg}','Foreign',ARRAY[]::text[],now());
    INSERT INTO "OrganizationUser" (id,"organizationId","userId","roleId","branchIds","permissionOverrides") VALUES ('${member}','${org}','${user}','${role}',ARRAY['preserve-branch'],'{"tasks.update":"deny"}');
    INSERT INTO "Session" (id,"userId","organizationId","refreshTokenHash","expiresAt") VALUES ('${session}','${user}','${org}','unused',now()+interval '1 day');`);
  sql(readFileSync(`${migrations}/20261103120000_multi_role_access/migration.sql`, 'utf8'));
  const m = await db.organizationUser.findUniqueOrThrow({ where: { id: member }, include: { assignedRoles: true } });
  assert.equal(m.roleId, role); assert.deepEqual(m.branchIds, ['preserve-branch']); assert.deepEqual(m.permissionOverrides, { 'tasks.update': 'deny' });
  assert.equal(m.assignedRoles[0].roleId, role);
  assert.equal((await db.session.findUniqueOrThrow({ where: { id: session } })).activeRoleId, null);
  await assert.rejects(db.membershipRole.create({ data: { organizationId: org, membershipId: member, roleId: foreignRole } }));
  await assert.rejects(db.membershipRole.create({ data: { organizationId: org, membershipId: member, roleId: role } }));
  console.log('PASS: legacy role, membership, branches, overrides and session preserved; role backfilled; cross-tenant and duplicate grants rejected.');
} finally {
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await db.$disconnect();
}
