import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:net';
import { PrismaClient } from '@operix/database';
import { MODULE, getSystemRole } from '@operix/permissions';
import argon2 from 'argon2';
import { generate, generateSecret } from 'otplib';

// Real Nest HTTP stack and PostgreSQL, in an isolated schema. No seed/reset or
// operational tenant mutations. Only this run's UUID-named schema is dropped.
const root = resolve('../..');
const envFile = resolve(root, '.env');
const env = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {};
const baseUrl = process.env.P0_TEST_DATABASE_URL ?? env.DATABASE_URL;
const url = new URL(baseUrl);
if (!['localhost', '127.0.0.1'].includes(url.hostname))
  throw Error('P0 tests require a local PostgreSQL server');
const schema = `p0_test_${randomUUID().replaceAll('-', '')}`;
url.searchParams.set('schema', schema);
const db = new PrismaClient({ datasourceUrl: url.toString() });
const admin = new PrismaClient({ datasourceUrl: baseUrl });
const requireDb = createRequire(resolve(root, 'packages/database/package.json'));
const password = randomBytes(32).toString('base64url');
let server,
  base,
  org,
  foreign,
  a,
  b,
  foreignBranch,
  owner,
  viewer,
  employee,
  manager,
  administrator;
let output = '';
const id = () => randomUUID();
const json = (value) => JSON.parse(JSON.stringify(value));

async function call(method, path, principal = owner, body, tenant = principal?.organization.id) {
  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(principal
        ? { Authorization: `Bearer ${principal.accessToken}`, 'x-organization-id': tenant }
        : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: await res.json() };
}
async function user(roleKey, branchIds = [], permissions) {
  const definition = getSystemRole(roleKey);
  const role = await db.role.create({
    data: {
      organizationId: org.id,
      name: `${definition.name}-${id()}`,
      permissions: permissions ?? definition.permissions,
      // The initial baseline predates persisted scope metadata.
      ...(db._runtimeDataModel.models.Role.fields.some((f) => f.name === 'dataScope')
        ? { dataScope: definition.dataScope }
        : {}),
    },
  });
  const u = await db.user.create({
    data: {
      email: `${id()}@p0.invalid`,
      firstName: 'Regression',
      lastName: roleKey,
      passwordHash: await argon2.hash(password),
    },
  });
  await db.organizationUser.create({
    data: { organizationId: org.id, userId: u.id, roleId: role.id, branchIds },
  });
  const login = await call('POST', '/auth/login', null, { email: u.email, password });
  expect(login.status).toBe(201);
  return { ...login.body, roleId: role.id };
}
async function record(module, branchId = a.id, data = {}, createdBy = owner.user.id, extra = {}) {
  return db.businessRecord.create({
    data: {
      organizationId: org.id,
      branchId,
      module,
      type: 'test',
      name: `P0 ${id()}`,
      data,
      createdBy,
      updatedBy: createdBy,
      ...extra,
    },
  });
}
async function invoice(customer, amount = '100.00', branchId = a.id, currency = 'USD') {
  const result = await call('POST', '/finance/invoices', owner, {
    customerId: customer.id,
    branchId,
    number: id(),
    currency,
    subtotal: Number(amount),
    tax: 0,
  });
  expect(result.status).toBe(201);
  return result.body;
}
async function payment(customer, inv, amount = '20.00', principal = owner, extra = {}) {
  return call('POST', '/finance/payments', principal, {
    customerId: customer.id,
    branchId: a.id,
    number: id(),
    amount: Number(amount),
    currency: 'USD',
    method: 'BANK_TRANSFER',
    receivedAt: new Date().toISOString(),
    allocations: [{ invoiceId: inv.id, amount: Number(amount) }],
    ...extra,
  });
}

beforeAll(async () => {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  execFileSync(
    process.execPath,
    [requireDb.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
    {
      cwd: resolve(root, 'packages/database'),
      env: { ...process.env, DATABASE_URL: url.toString() },
      stdio: 'pipe',
    },
  );
  const port = await new Promise((resolvePort) => {
    const listener = createServer();
    listener.listen(0, '127.0.0.1', () => {
      const p = listener.address().port;
      listener.close(() => resolvePort(p));
    });
  });
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['dist/main.js'], {
    cwd: resolve(root, 'apps/api'),
    windowsHide: true,
    env: {
      ...process.env,
      ...env,
      NODE_ENV: 'test',
      DATABASE_URL: url.toString(),
      JWT_ACCESS_SECRET: randomBytes(48).toString('hex'),
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => {
    output += chunk;
  });
  server.stderr.on('data', (chunk) => {
    output += chunk;
  });
  server.on('error', (error) => {
    output += `Child process error: ${error.message}`;
  });
  server.on('exit', (code, signal) => {
    output += `Child exited: ${code}/${signal}`;
  });
  let healthy = false;
  for (let i = 0; i < 300; i++) {
    try {
      healthy = (await fetch(`${base}/api/v1/health`, { signal: AbortSignal.timeout(1000) })).ok;
    } catch {}
    if (healthy || server.exitCode !== null) break;
    await delay(100);
  }
  if (!healthy)
    throw Error(
      `Test API did not start (${process.execPath}, exit ${server.exitCode}): ${output.replaceAll(url.toString(), '[database]')}`,
    );
  org = await db.organization.create({
    data: { name: 'Isolated P0 tests', slug: id(), status: 'ACTIVE' },
  });
  foreign = await db.organization.create({
    data: { name: 'Other isolated tenant', slug: id(), status: 'ACTIVE' },
  });
  for (const key of Object.values(MODULE)) {
    const m = await db.module.create({ data: { key, name: key } });
    await db.organizationModule.create({ data: { organizationId: org.id, moduleId: m.id } });
  }
  a = await db.branch.create({
    data: {
      organizationId: org.id,
      name: 'A',
      code: 'A',
      country: 'US',
      currency: 'USD',
      timezone: 'UTC',
    },
  });
  b = await db.branch.create({
    data: {
      organizationId: org.id,
      name: 'B',
      code: 'B',
      country: 'US',
      currency: 'USD',
      timezone: 'UTC',
    },
  });
  foreignBranch = await db.branch.create({
    data: {
      organizationId: foreign.id,
      name: 'Other',
      code: 'F',
      country: 'US',
      currency: 'USD',
      timezone: 'UTC',
    },
  });
  owner = await user('company_owner');
  viewer = await user('readonly_user', [a.id]);
  employee = await user('employee', [a.id]);
  manager = await user('project_manager', [a.id]);
  administrator = await user('company_admin');
});
afterAll(async () => {
  if (server && server.exitCode === null) {
    const stopped = new Promise((resolveStop) => server.once('exit', resolveStop));
    server.kill();
    await stopped;
  }
  await db.$disconnect();
  if (!/^p0_test_[a-f0-9]{32}$/.test(schema)) throw Error('Invalid cleanup schema');
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
});

describe('P0 security and posting regressions over HTTP/PostgreSQL', () => {
  it('FIN/DATA: posting permissions and branch/tenant boundaries hold for invoice references and verification', async () => {
    const restricted = await user('company_owner', [a.id]);
    const customer = await record('customers', b.id);
    const inv = await invoice(customer, '100', b.id);
    const p = await payment(customer, inv, '20', owner, { branchId: b.id });
    expect(p.status).toBe(201);
    expect((await call('POST', `/finance/payments/${p.body.id}/verify`, restricted)).status).toBe(
      404,
    );
    expect((await payment(customer, inv, '20', restricted, { branchId: b.id })).status).toBe(403);
    expect((await payment(customer, inv, '20', employee, { branchId: b.id })).status).toBe(403);
    const fc = await record('customers', foreignBranch.id, {}, owner.user.id, {
      organizationId: foreign.id,
    });
    const fi = await db.invoice.create({
      data: {
        organizationId: foreign.id,
        branchId: foreignBranch.id,
        customerId: fc.id,
        number: id(),
        currency: 'USD',
        subtotal: 100,
        tax: 0,
        total: 100,
        createdBy: owner.user.id,
      },
    });
    const fp = await db.payment.create({
      data: {
        organizationId: foreign.id,
        branchId: foreignBranch.id,
        customerId: fc.id,
        number: id(),
        currency: 'USD',
        amount: 20,
        method: 'BANK_TRANSFER',
        receivedAt: new Date(),
        createdBy: owner.user.id,
      },
    });
    expect((await call('POST', `/finance/payments/${fp.id}/verify`, owner)).status).toBe(404);
    const local = await record('customers');
    expect((await payment(local, fi)).status).toBe(400);
    expect((await db.payment.findUniqueOrThrow({ where: { id: p.body.id } })).status).toBe(
      'PENDING_VERIFICATION',
    );
    expect(String((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).paid)).toBe('0');
    expect((await call('POST', `/finance/payments/${p.body.id}/verify`, owner)).status).toBe(201);
    expect(String((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).paid)).toBe('20');
  });

  it('INV/DATA: enforces movement capabilities, foreign items and tenant-safe references', async () => {
    const receiver = await user(
      'inventory_manager',
      [a.id],
      ['inventory.receive', 'inventory.view'],
    );
    const item = await call('POST', '/inventory/items', receiver, {
      code: id(),
      name: 'Scoped receipts',
      category: 'test',
      unit: 'm',
      currency: 'USD',
      branchId: a.id,
    });
    expect(item.status).toBe(201);
    const path = `/inventory/items/${item.body.id}/movements`;
    expect(
      (
        await call('POST', path, receiver, {
          type: 'PURCHASE_RECEIPT',
          quantity: 3,
          idempotencyKey: id(),
        })
      ).status,
    ).toBe(201);
    expect(
      (await call('POST', path, receiver, { type: 'ISSUE', quantity: 1, idempotencyKey: id() }))
        .status,
    ).toBe(403);
    const foreignItem = await db.inventoryItem.create({
      data: {
        organizationId: foreign.id,
        branchId: foreignBranch.id,
        code: id(),
        name: 'Other',
        category: 'test',
        unit: 'm',
        currency: 'USD',
      },
    });
    expect(
      (
        await call('POST', `/inventory/items/${foreignItem.id}/movements`, owner, {
          type: 'PURCHASE_RECEIPT',
          quantity: 1,
          idempotencyKey: id(),
        })
      ).status,
    ).toBe(404);
    const project = await record('projects', foreignBranch.id, {}, owner.user.id, {
      organizationId: foreign.id,
    });
    expect(
      (
        await call('POST', path, owner, {
          type: 'ISSUE',
          quantity: 1,
          referenceType: 'project',
          referenceId: project.id,
          idempotencyKey: id(),
        })
      ).status,
    ).toBe(400);
    expect(
      String((await db.inventoryItem.findUniqueOrThrow({ where: { id: item.body.id } })).quantity),
    ).toBe('3');
    expect(await db.inventoryMovement.count({ where: { itemId: item.body.id } })).toBe(1);
  });

  it('AUTHZ/DATA: invitations cannot delegate broader capabilities or foreign branches', async () => {
    const inviter = await user('company_admin', [a.id], ['users.manage', 'customers.view']);
    const narrowRole = await db.role.create({
      data: {
        organizationId: org.id,
        name: id(),
        dataScope: 'branch',
        permissions: ['customers.view'],
      },
    });
    const email = () => `${id()}@p0.invalid`;
    expect(
      (
        await call('POST', '/organization/invitations', inviter, {
          email: email(),
          roleId: owner.roleId,
          branchIds: [a.id],
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call('POST', '/organization/invitations', owner, {
          email: email(),
          roleId: narrowRole.id,
          branchIds: [foreignBranch.id],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call('POST', '/organization/invitations', inviter, {
          email: email(),
          roleId: narrowRole.id,
          branchIds: [b.id],
        })
      ).status,
    ).toBe(403);
    const allowed = await call('POST', '/organization/invitations', inviter, {
      email: email(),
      roleId: narrowRole.id,
      branchIds: [a.id],
    });
    expect(allowed.status).toBe(201);
    expect(
      (await db.invitation.findUniqueOrThrow({ where: { id: allowed.body.id } })).branchIds,
    ).toEqual([a.id]);
  });

  it('AUTHZ-01: branch ceilings cover writes, attendance, inventory, directory and financial aggregates', async () => {
    const scoped = await user('company_owner', [a.id]);
    const own = await record('customers', a.id, {}, owner.user.id, { status: 'ACTIVE' });
    const other = await record('customers', b.id, {}, owner.user.id, { status: 'ACTIVE' });
    expect(
      (await call('PATCH', `/records/customers/${own.id}`, scoped, { name: 'allowed' })).status,
    ).toBe(200);
    expect(
      (await call('PATCH', `/records/customers/${other.id}`, scoped, { name: 'denied' })).status,
    ).toBe(404);
    expect((await call('DELETE', `/records/customers/${other.id}`, scoped)).status).toBe(404);
    expect((await db.businessRecord.findUniqueOrThrow({ where: { id: other.id } })).name).toBe(
      other.name,
    );
    const shift = await record('attendance', b.id, {}, owner.user.id, {
      status: 'PENDING',
      type: 'shift',
    });
    expect((await call('GET', '/attendance', scoped)).body.map((x) => x.id)).not.toContain(
      shift.id,
    );
    expect((await call('GET', '/attendance/pending', scoped)).body.map((x) => x.id)).not.toContain(
      shift.id,
    );
    expect((await call('POST', `/attendance/${shift.id}/approve`, scoped)).status).toBe(400);
    const stock = await call('POST', '/inventory/items', owner, {
      code: id(),
      name: 'Branch B',
      category: 'test',
      unit: 'm',
      currency: 'USD',
      branchId: b.id,
    });
    expect((await call('GET', '/inventory/items', scoped)).body.map((x) => x.id)).not.toContain(
      stock.body.id,
    );
    expect(
      (
        await call('POST', `/inventory/items/${stock.body.id}/movements`, scoped, {
          type: 'PURCHASE_RECEIPT',
          quantity: 1,
          idempotencyKey: id(),
        })
      ).status,
    ).toBe(404);
    await invoice(own, '17', a.id, 'EUR');
    await invoice(other, '999', b.id, 'EUR');
    const summary = await call('GET', '/finance/summary', scoped);
    expect(summary.body.invoices.find((x) => x.currency === 'EUR')._sum.total).toBe('17');
    const dashboard = await call('GET', '/workspace/dashboard', scoped);
    expect(dashboard.body.metrics.find((x) => x.key === 'receivables-EUR').value).toBe('17 EUR');
    expect((await call('GET', '/organization', scoped)).body.branches.map((x) => x.id)).toEqual([
      a.id,
    ]);
  });

  it('AUTHZ-01: branch roles with no branches fail closed; customer and employee links limit records', async () => {
    const empty = await user('readonly_user');
    expect((await call('GET', '/records/customers', empty)).body.data).toEqual([]);
    const own = await record('customers'),
      other = await record('customers');
    const portal = await user('customer', [], ['customers.view', 'documents.view']);
    const key = { organizationId_userId: { organizationId: org.id, userId: portal.user.id } };
    expect((await call('GET', `/records/customers/${own.id}`, portal)).status).toBe(404);
    await db.organizationUser.update({ where: key, data: { customerId: own.id } });
    expect((await call('GET', `/records/customers/${own.id}`, portal)).status).toBe(200);
    expect((await call('GET', `/records/customers/${other.id}`, portal)).status).toBe(404);
    const document = await record('documents', a.id, { customerId: own.id });
    const secret = await record('documents', a.id, { customerId: other.id });
    expect((await call('GET', `/records/documents/${document.id}`, portal)).status).toBe(200);
    expect((await call('GET', `/records/documents/${secret.id}`, portal)).status).toBe(404);
    const staff = await user('employee', [a.id], ['employees.view']);
    const profile = await record('employees');
    await db.organizationUser.update({
      where: { organizationId_userId: { organizationId: org.id, userId: staff.user.id } },
      data: { employeeId: profile.id },
    });
    expect((await call('GET', '/records/employees', staff)).body.data.map((x) => x.id)).toEqual([
      profile.id,
    ]);
  });

  it('AUTHZ-02: allow/deny expiry, object overrides, global module disablement and refreshed login agree', async () => {
    const subject = await user('employee', [a.id]);
    const where = { organizationId_userId: { organizationId: org.id, userId: subject.user.id } };
    await db.organizationUser.update({
      where,
      data: { permissionOverrides: { 'customers.view': 'allow' } },
    });
    expect((await call('GET', '/records/customers', subject)).status).toBe(200);
    await db.organizationUser.update({
      where,
      data: {
        permissionOverrides: [
          { permission: 'customers.view', effect: 'allow' },
          { permission: 'customers.view', effect: 'deny' },
        ],
      },
    });
    expect((await call('GET', '/records/customers', subject)).status).toBe(403);
    const login = await call('POST', '/auth/login', null, { email: subject.user.email, password });
    expect(login.body.permissions).not.toContain('customers.view');
    await db.organizationUser.update({
      where,
      data: {
        permissionOverrides: [
          { permission: 'customers.view', effect: 'allow', expiresAt: '2000-01-01T00:00:00Z' },
        ],
      },
    });
    expect((await call('GET', '/records/customers', subject)).status).toBe(403);
    const m = await db.module.findUniqueOrThrow({ where: { key: 'crm' } });
    try {
      await db.module.update({ where: { id: m.id }, data: { enabled: false } });
      expect((await call('GET', '/records/customers', owner)).status).toBe(403);
    } finally {
      await db.module.update({ where: { id: m.id }, data: { enabled: true } });
    }
  });

  it('AUTHZ-03: list and mutation responses redact sensitive fields while preserving stored values', async () => {
    const hr = await record('employees', a.id, {
      firstName: 'Before',
      bankAccountNumber: 'TEST-HIDDEN',
      customBlob: { nested: 'private' },
    });
    const edited = await call('PATCH', `/records/employees/${hr.id}`, administrator, {
      data: { firstName: 'After' },
    });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toEqual({ firstName: 'After' });
    const saved = await db.businessRecord.findUniqueOrThrow({ where: { id: hr.id } });
    expect(saved.data.bankAccountNumber).toBe('TEST-HIDDEN');
    expect(
      (
        await call('PATCH', `/records/employees/${hr.id}`, administrator, {
          data: { bankAccountNumber: 'REPLACED' },
        })
      ).status,
    ).toBe(403);
    const listed = await call('GET', '/records/employees', administrator);
    expect(JSON.stringify(listed.body)).not.toContain('TEST-HIDDEN');
    const mine = await record('notifications', a.id, { recipientUserId: employee.user.id });
    const other = await record('notifications', a.id, { recipientUserId: owner.user.id });
    const notifications = await call('GET', '/records/notifications', employee);
    expect(notifications.body.data.map((x) => x.id)).toContain(mine.id);
    expect(notifications.body.data.map((x) => x.id)).not.toContain(other.id);
  });

  it('DATA-01: validates references on create/update and enforces composite foreign keys', async () => {
    const foreignCustomer = await record('customers', foreignBranch.id, {}, owner.user.id, {
      organizationId: foreign.id,
    });
    const local = await record('customers');
    const project = await record('projects', a.id, { customerId: local.id });
    expect(
      (
        await call('PATCH', `/records/projects/${project.id}`, owner, {
          data: { customerId: foreignCustomer.id },
        })
      ).status,
    ).toBe(400);
    expect(
      (await db.businessRecord.findUniqueOrThrow({ where: { id: project.id } })).data.customerId,
    ).toBe(local.id);
    for (const customerId of [foreignCustomer.id, project.id])
      expect(
        (
          await call('POST', '/finance/invoices', owner, {
            customerId,
            branchId: a.id,
            number: id(),
            currency: 'USD',
            subtotal: 1,
            tax: 0,
          })
        ).status,
      ).toBe(400);
    await expect(
      db.businessRecord.create({
        data: {
          organizationId: org.id,
          branchId: foreignBranch.id,
          module: 'customers',
          type: 'test',
          name: 'bad',
          createdBy: owner.user.id,
          updatedBy: owner.user.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      db.invoice.create({
        data: {
          organizationId: org.id,
          customerId: foreignCustomer.id,
          number: id(),
          currency: 'USD',
          subtotal: 1,
          tax: 0,
          total: 1,
          createdBy: owner.user.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    const role = await db.role.create({
      data: { organizationId: foreign.id, name: id(), permissions: [] },
    });
    await expect(
      db.organizationUser.update({
        where: { organizationId_userId: { organizationId: org.id, userId: viewer.user.id } },
        data: { roleId: role.id },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('FIN-01: uses exact decimals, rejects unsupported precision/currency and revalidates before verification', async () => {
    const customer = await record('customers');
    const created = await call('POST', '/finance/invoices', owner, {
      customerId: customer.id,
      branchId: a.id,
      number: id(),
      currency: 'USD',
      subtotal: '0.10',
      tax: '0.20',
    });
    expect(created.status).toBe(201);
    expect(created.body.total).toBe('0.3');
    expect(
      (
        await call('POST', '/finance/invoices', owner, {
          customerId: customer.id,
          branchId: a.id,
          number: id(),
          currency: 'GNF',
          subtotal: '1.50',
          tax: 0,
        })
      ).status,
    ).toBe(400);
    const inv = await invoice(customer);
    const other = await record('customers');
    expect((await payment(other, inv)).status).toBe(400);
    expect(
      (
        await payment(customer, inv, '10', owner, {
          allocations: [{ invoiceId: inv.id, amount: '11' }],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await payment(customer, inv, '20', owner, {
          allocations: [{ invoiceId: 'bad-id', amount: 20 }],
        })
      ).status,
    ).toBe(400);
    const pending = await payment(customer, inv);
    expect(pending.status).toBe(201);
    await db.payment.update({ where: { id: pending.body.id }, data: { currency: 'EUR' } });
    expect((await call('POST', `/finance/payments/${pending.body.id}/verify`)).status).toBe(400);
    expect(String((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).paid)).toBe('0');
    expect((await db.payment.findUniqueOrThrow({ where: { id: pending.body.id } })).status).toBe(
      'PENDING_VERIFICATION',
    );
  });

  it('FIN-02: concurrent duplicate recording and verification post once; payload conflicts return 409', async () => {
    const customer = await record('customers'),
      inv = await invoice(customer);
    const request = { number: id(), receivedAt: new Date().toISOString() };
    const recorded = await Promise.all(
      Array.from({ length: 6 }, () => payment(customer, inv, '20', owner, request)),
    );
    expect(recorded.map((x) => x.status)).toEqual(Array(6).fill(201));
    expect(new Set(recorded.map((x) => x.body.id)).size).toBe(1);
    const paymentId = recorded[0].body.id;
    expect((await payment(customer, inv, '21', owner, request)).status).toBe(409);
    const verified = await Promise.all(
      Array.from({ length: 8 }, () => call('POST', `/finance/payments/${paymentId}/verify`)),
    );
    expect(verified.map((x) => x.status)).toEqual(Array(8).fill(201));
    expect(String((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).paid)).toBe('20');
    expect(await db.paymentAllocation.count({ where: { paymentId } })).toBe(1);
  });

  it('FIN-02: multi-invoice posting rolls back completely and refuses unreconciled balances', async () => {
    const customer = await record('customers'),
      first = await invoice(customer),
      second = await invoice(customer);
    const deposit = await payment(customer, second, '90');
    expect((await call('POST', `/finance/payments/${deposit.body.id}/verify`)).status).toBe(201);
    const batch = await payment(customer, first, '100', owner, {
      allocations: [
        { invoiceId: first.id, amount: 50 },
        { invoiceId: second.id, amount: 50 },
      ],
    });
    expect(batch.status).toBe(201);
    expect((await call('POST', `/finance/payments/${batch.body.id}/verify`)).status).toBe(400);
    expect(String((await db.invoice.findUniqueOrThrow({ where: { id: first.id } })).paid)).toBe(
      '0',
    );
    expect(String((await db.invoice.findUniqueOrThrow({ where: { id: second.id } })).paid)).toBe(
      '90',
    );
    expect((await db.payment.findUniqueOrThrow({ where: { id: batch.body.id } })).status).toBe(
      'PENDING_VERIFICATION',
    );
    const valid = await payment(customer, first);
    await db.invoice.update({ where: { id: first.id }, data: { paid: 1 } });
    expect((await call('POST', `/finance/payments/${valid.body.id}/verify`)).status).toBe(409);
    expect(String((await db.invoice.findUniqueOrThrow({ where: { id: first.id } })).paid)).toBe(
      '1',
    );
  });

  it('INV-01: idempotent concurrent receipt, signed adjustments and unsupported movement guards reconcile', async () => {
    const stock = await call('POST', '/inventory/items', owner, {
      code: id(),
      name: 'Replay',
      category: 'test',
      unit: 'm',
      currency: 'USD',
      branchId: a.id,
    });
    const itemId = stock.body.id,
      key = id();
    const move = (body) =>
      call('POST', `/inventory/items/${itemId}/movements`, owner, {
        idempotencyKey: id(),
        ...body,
      });
    const requests = await Promise.all(
      Array.from({ length: 8 }, () =>
        move({ type: 'PURCHASE_RECEIPT', quantity: '10.0001', idempotencyKey: key }),
      ),
    );
    expect(requests.map((x) => x.status)).toEqual(Array(8).fill(201));
    expect(new Set(requests.map((x) => x.body.id)).size).toBe(1);
    expect(
      (await move({ type: 'PURCHASE_RECEIPT', quantity: 11, idempotencyKey: key })).status,
    ).toBe(409);
    for (const type of ['TRANSFER', 'RESERVATION'])
      expect((await move({ type, quantity: 1 })).status).toBe(400);
    for (const quantity of [0, -2, '0.00001'])
      expect((await move({ type: 'ISSUE', quantity })).status).toBe(400);
    expect((await move({ type: 'INITIAL', quantity: 1 })).status).toBe(400);
    expect((await move({ type: 'ADJUSTMENT', quantity: -1 })).status).toBe(400);
    expect(
      (await move({ type: 'ADJUSTMENT', quantity: '-2.0001', notes: 'Verified stock correction' }))
        .status,
    ).toBe(201);
    expect((await move({ type: 'RETURN', quantity: '1' })).status).toBe(201);
    const saved = await db.inventoryItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(String(saved.quantity)).toBe('9');
    expect(await db.inventoryMovement.count({ where: { itemId } })).toBe(3);
    await db.inventoryItem.update({ where: { id: itemId }, data: { quantity: 8 } });
    expect((await move({ type: 'ISSUE', quantity: 1 })).status).toBe(409);
    expect(await db.inventoryMovement.count({ where: { itemId } })).toBe(3);
  });

  it('FLOW-01: protects gate metadata and commercial approvals while allowing scoped project start', async () => {
    const project = await record('projects', a.id, {
      contractRequirement: 'before_work_starts',
      projectManagerUserId: manager.user.id,
    });
    expect(
      (
        await call('PATCH', `/records/projects/${project.id}`, manager, {
          data: { contractRequirement: 'not_required' },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call('PATCH', `/records/projects/${project.id}`, manager, {
          data: { description: 'Safe edit' },
        })
      ).status,
    ).toBe(200);
    expect(
      (await db.businessRecord.findUniqueOrThrow({ where: { id: project.id } })).data
        .contractRequirement,
    ).toBe('before_work_starts');
    const contract = await record('contracts', a.id, { projectId: project.id });
    expect(
      (await call('PATCH', `/records/contracts/${contract.id}`, owner, { status: 'COMPLETED' }))
        .status,
    ).toBe(400);
    // Trusted fixture represents an already executed historical contract.
    await db.businessRecord.update({ where: { id: contract.id }, data: { status: 'COMPLETED' } });
    expect((await call('POST', `/projects/${project.id}/start`, manager, {})).status).toBe(201);
    expect((await db.businessRecord.findUniqueOrThrow({ where: { id: project.id } })).status).toBe(
      'IN_PROGRESS',
    );
    const noContract = await record('projects', a.id, {
      contractRequirement: 'before_work_starts',
    });
    expect(
      (
        await call('POST', `/projects/${noContract.id}/start`, owner, {
          overrideReason: 'Authorized exceptional start',
        })
      ).status,
    ).toBe(201);
    expect(
      await db.auditLog.count({
        where: { resourceId: noContract.id, action: 'CONTRACT_GATE_OVERRIDE' },
      }),
    ).toBe(1);
  });

  it('AUTH-01: rejects invalid proof, expired enrollment and confirmation from a different session', async () => {
    const target = await user('employee', [a.id]),
      secret = generateSecret();
    await db.user.update({
      where: { id: target.user.id },
      data: { mfaEnabled: true, mfaSecret: secret },
    });
    expect(
      (
        await call('POST', '/auth/mfa/enroll', target, {
          password: 'incorrect-password',
          code: await generate({ secret }),
        })
      ).status,
    ).toBe(401);
    expect((await call('POST', '/auth/mfa/enroll', target, { password })).status).toBe(401);
    const login = await call('POST', '/auth/login', null, {
      email: target.user.email,
      password,
      mfaCode: await generate({ secret }),
    });
    expect(login.status).toBe(201);
    const enrolled = await call('POST', '/auth/mfa/enroll', target, {
      password,
      code: await generate({ secret }),
    });
    const code = await generate({ secret: enrolled.body.secret });
    expect((await call('POST', '/auth/mfa/confirm', login.body, { code })).status).toBe(401);
    await db.user.update({
      where: { id: target.user.id },
      data: { pendingMfaExpiresAt: new Date(0) },
    });
    expect((await call('POST', '/auth/mfa/confirm', target, { code })).status).toBe(401);
    const saved = await db.user.findUniqueOrThrow({ where: { id: target.user.id } });
    expect(saved.mfaEnabled).toBe(true);
    expect(saved.mfaSecret).toBe(secret);
  });

  it('AUTHZ-01: scopes detail, list, search, dashboard and writes; denies foreign tenants', async () => {
    const own = await record('customers');
    const other = await record('customers', b.id);
    expect((await call('GET', `/records/customers/${own.id}`, viewer)).status).toBe(200);
    expect((await call('GET', `/records/customers/${other.id}`, viewer)).status).toBe(404);
    expect((await call('GET', `/records/customers/${own.id}`, null)).status).toBe(401);
    expect(
      (await call('GET', `/records/customers/${own.id}`, viewer, undefined, foreign.id)).status,
    ).toBe(403);
    const list = await call('GET', '/records/customers', viewer);
    expect(list.body.data.map((x) => x.id)).not.toContain(other.id);
    const search = await call(
      'GET',
      `/workspace/search?q=${encodeURIComponent(other.name)}`,
      viewer,
    );
    expect(search.body.data).toHaveLength(0);
    expect(
      (
        await call('POST', '/records', viewer, {
          module: 'customers',
          type: 'test',
          name: 'denied',
        })
      ).status,
    ).toBe(403);
  });

  it('AUTHZ-01: assignment and self scopes do not expose other users tasks', async () => {
    const mine = await record('tasks', a.id, { assigneeUserId: employee.user.id });
    const other = await record('tasks', a.id, { assigneeUserId: owner.user.id });
    expect((await call('GET', `/records/tasks/${mine.id}`, employee)).status).toBe(200);
    expect((await call('GET', `/records/tasks/${other.id}`, employee)).status).toBe(404);
  });

  it('AUTHZ-02: explicit deny and disabled modules override grants', async () => {
    const member = { organizationId_userId: { organizationId: org.id, userId: viewer.user.id } };
    try {
      await db.organizationUser.update({
        where: member,
        data: { permissionOverrides: [{ permission: 'customers.view', effect: 'deny' }] },
      });
      expect((await call('GET', '/records/customers', viewer)).status).toBe(403);
    } finally {
      await db.organizationUser.update({ where: member, data: { permissionOverrides: {} } });
    }
    const module = await db.module.findUniqueOrThrow({ where: { key: 'crm' } });
    const where = { organizationId_moduleId: { organizationId: org.id, moduleId: module.id } };
    try {
      await db.organizationModule.update({ where, data: { enabled: false } });
      expect((await call('GET', '/records/customers', owner)).status).toBe(403);
    } finally {
      await db.organizationModule.update({ where, data: { enabled: true } });
    }
  });

  it('AUTHZ-03: employee sensitive fields are redacted and notifications are recipient-only', async () => {
    const hr = await record('employees', a.id, {
      firstName: 'Visible',
      bankAccountNumber: 'TEST-PRIVATE',
      payrollProfile: { secret: 'private' },
      arbitrarySensitiveBlob: 'private',
    });
    const read = await call('GET', `/records/employees/${hr.id}`, administrator);
    expect(read.status).toBe(200);
    expect(read.body.data.firstName).toBe('Visible');
    expect(JSON.stringify(read.body)).not.toContain('private');
    expect(read.body.data.bankAccountNumber).toBeUndefined();
    expect(
      (await call('GET', `/records/employees/${hr.id}`, owner)).body.data.bankAccountNumber,
    ).toBe('TEST-PRIVATE');
    const other = await record('notifications', a.id, { recipientUserId: owner.user.id });
    const mine = await record('notifications', a.id, { recipientUserId: employee.user.id });
    expect((await call('GET', `/records/notifications/${other.id}`, employee)).status).toBe(404);
    expect((await call('GET', `/records/notifications/${mine.id}`, employee)).status).toBe(200);
  });

  it('AUTHZ-04: reports.view alone cannot reveal financial totals', async () => {
    expect((await call('GET', '/finance/summary', viewer)).status).toBe(403);
    expect((await call('GET', '/finance/summary', owner)).status).toBe(200);
  });

  it('DATA-01: rejects foreign branch and missing or wrong-tenant customer references', async () => {
    const before = await db.businessRecord.count();
    expect(
      (
        await call('POST', '/records', owner, {
          module: 'customers',
          type: 'test',
          name: 'invalid',
          branchId: foreignBranch.id,
        })
      ).status,
    ).toBe(400);
    expect(await db.businessRecord.count()).toBe(before);
    expect(
      (
        await call('POST', '/finance/invoices', owner, {
          customerId: id(),
          branchId: a.id,
          number: id(),
          currency: 'USD',
          subtotal: 10,
          tax: 0,
        })
      ).status,
    ).toBe(400);
  });

  it('FIN-01: rejects invalid nested allocation amounts, duplicates, currency and customer mismatches', async () => {
    const customer = await record('customers');
    const inv = await invoice(customer);
    const before = await db.payment.count();
    for (const amount of [-5, 0, 0.001])
      expect(
        (
          await payment(customer, inv, '20', owner, {
            allocations: [{ invoiceId: inv.id, amount }],
          })
        ).status,
      ).toBe(400);
    expect((await payment(customer, inv, '20', owner, { currency: 'EUR' })).status).toBe(400);
    expect(
      (
        await payment(customer, inv, '20', owner, {
          allocations: [
            { invoiceId: inv.id, amount: 10 },
            { invoiceId: inv.id, amount: 10 },
          ],
        })
      ).status,
    ).toBe(400);
    expect(await db.payment.count()).toBe(before);
    const valid = await payment(customer, inv);
    expect(valid.status, JSON.stringify(valid.body)).toBe(201);
    expect((await call('POST', `/finance/payments/${valid.body.id}/verify`)).status).toBe(201);
    expect(String((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).paid)).toBe('20');
  });

  it('FIN-02: concurrent verification cannot overpay or lose allocations; retry is idempotent', async () => {
    const customer = await record('customers');
    const inv = await invoice(customer);
    const payments = await Promise.all(Array.from({ length: 8 }, () => payment(customer, inv)));
    expect(payments.every((p) => p.status === 201)).toBe(true);
    const posted = await Promise.all(
      payments.map((p) => call('POST', `/finance/payments/${p.body.id}/verify`)),
    );
    expect(posted.filter((p) => p.status === 201)).toHaveLength(5);
    const balance = await db.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    const ledger = await db.paymentAllocation.aggregate({
      where: { invoiceId: inv.id, payment: { status: 'VERIFIED' } },
      _sum: { amount: true },
    });
    expect(String(balance.paid)).toBe('100');
    expect(String(ledger._sum.amount)).toBe('100');
    const verified = await db.payment.findFirstOrThrow({
      where: { id: { in: payments.map((p) => p.body.id) }, status: 'VERIFIED' },
    });
    expect((await call('POST', `/finance/payments/${verified.id}/verify`)).status).toBe(201);
    expect(String((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).paid)).toBe(
      '100',
    );
  });

  it('INV-01: negative receipts and concurrent overdraw fail without ledger drift', async () => {
    const created = await call('POST', '/inventory/items', owner, {
      code: id(),
      name: 'Stock regression',
      category: 'test',
      unit: 'm',
      currency: 'USD',
      branchId: a.id,
    });
    expect(created.status).toBe(201);
    const item = created.body;
    const move = (type, quantity) =>
      call('POST', `/inventory/items/${item.id}/movements`, owner, {
        type,
        quantity,
        idempotencyKey: id(),
      });
    expect((await move('PURCHASE_RECEIPT', -2)).status).toBe(400);
    expect((await move('PURCHASE_RECEIPT', 10)).status).toBe(201);
    const issued = await Promise.all(Array.from({ length: 8 }, () => move('ISSUE', 2)));
    expect(issued.filter((x) => x.status === 201)).toHaveLength(5);
    expect(
      String((await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).quantity),
    ).toBe('0');
    expect(await db.inventoryMovement.count({ where: { itemId: item.id, type: 'ISSUE' } })).toBe(5);
  });

  it('FLOW-01: generic PATCH cannot start projects, bypass archival, or forge contract completion', async () => {
    const project = await record('projects', a.id, {
      contractRequirement: 'before_work_starts',
      projectManagerUserId: manager.user.id,
    });
    expect((await call('POST', `/projects/${project.id}/start`, manager, {})).status).toBe(400);
    expect(
      (await call('PATCH', `/records/projects/${project.id}`, manager, { status: 'IN_PROGRESS' }))
        .status,
    ).toBe(400);
    expect((await db.businessRecord.findUniqueOrThrow({ where: { id: project.id } })).status).toBe(
      'DRAFT',
    );
    const updater = await user('company_admin', [], ['customers.view', 'customers.update']);
    const customer = await record('customers');
    expect((await call('DELETE', `/records/customers/${customer.id}`, updater)).status).toBe(403);
    expect(
      (await call('PATCH', `/records/customers/${customer.id}`, updater, { status: 'ARCHIVED' }))
        .status,
    ).toBe(400);
    expect((await call('DELETE', `/records/customers/${customer.id}`, owner)).status).toBe(200);
    expect(
      (await db.businessRecord.findUniqueOrThrow({ where: { id: customer.id } })).archivedAt,
    ).not.toBeNull();
  });

  it('AUTH-01: MFA replacement requires fresh proof and keeps the active factor until confirmation', async () => {
    const secret = generateSecret();
    const target = await user('employee', [a.id]);
    await db.user.update({
      where: { id: target.user.id },
      data: { mfaEnabled: true, mfaSecret: secret },
    });
    expect((await call('POST', '/auth/mfa/enroll', target, {})).status).toBeGreaterThanOrEqual(400);
    let saved = await db.user.findUniqueOrThrow({ where: { id: target.user.id } });
    expect(saved.mfaEnabled).toBe(true);
    expect(saved.mfaSecret).toBe(secret);
    const enrollment = await call('POST', '/auth/mfa/enroll', target, {
      password,
      code: await generate({ secret }),
    });
    expect(enrollment.status).toBe(201);
    saved = await db.user.findUniqueOrThrow({ where: { id: target.user.id } });
    expect(saved.mfaEnabled).toBe(true);
    expect(saved.mfaSecret).toBe(secret);
    expect(
      (
        await call('POST', '/auth/mfa/confirm', target, {
          code: await generate({ secret: enrollment.body.secret }),
        })
      ).status,
    ).toBe(201);
    saved = await db.user.findUniqueOrThrow({ where: { id: target.user.id } });
    expect(saved.mfaEnabled).toBe(true);
    expect(saved.mfaSecret).toBe(enrollment.body.secret);
    expect(
      (await call('POST', '/auth/login', null, { email: target.user.email, password })).status,
    ).toBe(401);
  });
});
