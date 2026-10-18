import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseEnv } from 'node:util';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@operix/database';

const root = resolve('../..');
const envFile = resolve(root, '.env');
const env = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {};
const url = new URL(process.env.P0_TEST_DATABASE_URL ?? env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(url.hostname))
  throw Error('Migration rehearsal requires local PostgreSQL');
const requireDb = createRequire(resolve(root, 'packages/database/package.json'));
const migrations = resolve(root, 'packages/database/prisma/migrations');
const original = [
  '20260804224400_init',
  '20260805185330_add_password_reset_and_invitations',
  '20260816120000_subscriptions',
]
  .map((name) => readFileSync(resolve(migrations, name, 'migration.sql'), 'utf8'))
  .join('\n');
const migration = readFileSync(
  resolve(migrations, '20261002220000_p0_integrity/migration.sql'),
  'utf8',
);

async function rehearsal(work) {
  const schema = `p0_migration_${randomUUID().replaceAll('-', '')}`;
  const testUrl = new URL(url);
  testUrl.searchParams.set('schema', schema);
  const db = new PrismaClient({ datasourceUrl: testUrl.toString() });
  const sql = (text) =>
    execFileSync(
      process.execPath,
      [
        requireDb.resolve('prisma/build/index.js'),
        'db',
        'execute',
        '--stdin',
        '--url',
        testUrl.toString(),
      ],
      {
        input: `SET search_path TO "${schema}";\n${text}`,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
  try {
    await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    sql(original);
    const ids = Object.fromEntries(
      ['org', 'role', 'customer', 'invoice', 'payment', 'allocation', 'item', 'actor'].map(
        (key) => [key, randomUUID()],
      ),
    );
    sql(`
      INSERT INTO "Organization" (id,name,slug,"updatedAt") VALUES ('${ids.org}','Migration fixture','${schema}',now());
      INSERT INTO "Role" (id,"organizationId",name,"isSystem","updatedAt") VALUES ('${ids.role}','${ids.org}','Company Owner',true,now());
      INSERT INTO "BusinessRecord" (id,"organizationId",module,type,name,"createdBy","updatedBy","updatedAt") VALUES ('${ids.customer}','${ids.org}','customers','company','Preserve customer','${ids.actor}','${ids.actor}',now());
      INSERT INTO "Invoice" (id,"organizationId","customerId",number,currency,subtotal,tax,total,paid,"createdBy","updatedAt") VALUES ('${ids.invoice}','${ids.org}','${ids.customer}','INV-1','USD',100,0,100,50,'${ids.actor}',now());
      INSERT INTO "Payment" (id,"organizationId","customerId",number,amount,currency,method,status,"receivedAt","createdBy","updatedAt") VALUES ('${ids.payment}','${ids.org}','${ids.customer}','PAY-1',50,'USD','BANK_TRANSFER','VERIFIED',now(),'${ids.actor}',now());
      INSERT INTO "PaymentAllocation" (id,"paymentId","invoiceId",amount) VALUES ('${ids.allocation}','${ids.payment}','${ids.invoice}',50);
      INSERT INTO "InventoryItem" (id,"organizationId",code,name,category,unit,quantity,currency,"updatedAt") VALUES ('${ids.item}','${ids.org}','LEGACY','Preserve stock','test','m',42,'USD',now());
    `);
    await work({ db, sql, ids, schema });
  } finally {
    if (!/^p0_migration_[a-f0-9]{32}$/.test(schema)) throw Error('Unsafe cleanup schema');
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.$disconnect();
  }
}

describe('P0 migration with existing data', () => {
  it('preserves IDs and financial/stock truth, backfills scope and adds validated constraints', async () => {
    await rehearsal(async ({ db, sql, ids }) => {
      sql(migration);
      const invoice = await db.invoice.findUniqueOrThrow({ where: { id: ids.invoice } });
      expect(String(invoice.total)).toBe('100');
      expect(String(invoice.paid)).toBe('50');
      expect(invoice.customerId).toBe(ids.customer);
      const allocation = await db.paymentAllocation.findUniqueOrThrow({
        where: { id: ids.allocation },
      });
      expect(allocation.organizationId).toBe(ids.org);
      expect(String(allocation.amount)).toBe('50');
      const stock = await db.inventoryItem.findUniqueOrThrow({ where: { id: ids.item } });
      expect(String(stock.quantity)).toBe('42');
      expect(String(stock.openingQuantity)).toBe('42');
      expect(await db.inventoryMovement.count()).toBe(0);
      const role = await db.role.findUniqueOrThrow({ where: { id: ids.role } });
      expect(role.dataScope).toBe('all');
      expect(role.systemKey).toBe('company_owner');
      await expect(
        db.paymentAllocation.update({ where: { id: ids.allocation }, data: { amount: -1 } }),
      ).rejects.toThrow();
      await expect(
        db.inventoryItem.update({ where: { id: ids.item }, data: { quantity: -1 } }),
      ).rejects.toThrow();
      expect(await db.organization.count()).toBe(1);
      expect(await db.businessRecord.count()).toBe(1);
    });
  });

  it('aborts atomically on historical ledger drift without rewriting or deleting data', async () => {
    await rehearsal(async ({ db, sql, ids, schema }) => {
      sql(`UPDATE "Invoice" SET paid=51 WHERE id='${ids.invoice}'`);
      expect(() => sql(migration)).toThrow();
      const rows = await db.$queryRawUnsafe(
        `SELECT paid::text FROM "${schema}"."Invoice" WHERE id='${ids.invoice}'`,
      );
      expect(rows[0].paid).toBe('51.00');
      const columns = await db.$queryRawUnsafe(
        `SELECT column_name FROM information_schema.columns WHERE table_schema='${schema}' AND table_name='Role' AND column_name='dataScope'`,
      );
      expect(columns).toHaveLength(0);
    });
  });
});
