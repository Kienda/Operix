import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildWorld,
  call,
  createActor,
  fix,
  invoice,
  rec,
  uid,
  writeEvidence,
  type Actor,
  type World,
} from './harness';

/**
 * GHT has HQ and GN branches. Branch-restricted users (viewer@HQ, branch manager@GN,
 * inventory@GN, supervisor@GN) must not reach records that belong only to the other branch.
 */
let w: World;
let hqItem: string, gnItem: string, hqPendingShift: string;
let employeeHQ: Actor;
const ids = (res: { body: { data?: Array<{ id: string }> } | Array<{ id: string }> }) =>
  (Array.isArray(res.body) ? res.body : (res.body.data ?? [])).map((r) => r.id);

beforeAll(async () => {
  w = await buildWorld();
  await invoice(w.a.owner, w.r.customerA, w.HQ, 100);
  await invoice(w.a.owner, w.r.customerB, w.GN, 200);
  hqItem = (
    await call(w.a.owner, 'POST', '/inventory/items', {
      code: `HQ-${uid().slice(0, 6)}`,
      name: 'Business card paper 350gsm',
      category: 'paper',
      unit: 'sheet',
      currency: 'USD',
      branchId: w.HQ,
    })
  ).body.id;
  gnItem = (
    await call(w.a.owner, 'POST', '/inventory/items', {
      code: `GN-${uid().slice(0, 6)}`,
      name: 'Frontlit banner 440gsm',
      category: 'banner',
      unit: 'm2',
      currency: 'USD',
      branchId: w.GN,
    })
  ).body.id;
  employeeHQ = await createActor(w.ght, 'employee', { alias: 'shiftHQ', branches: ['HQ'] });
  hqPendingShift = (await call(employeeHQ, 'POST', '/attendance/check-in', fix(500))).body.id;
});

describe('Branch isolation', () => {
  it('LIST: viewer@HQ sees HQ customers only', async () => {
    const list = await call(w.a.viewer, 'GET', '/records/customers?limit=100');
    expect(list.status).toBe(200);
    expect(ids(list)).toContain(w.r.customerA);
    expect(ids(list)).not.toContain(w.r.customerB);
    expect(ids(list)).not.toContain(w.r.customerC);
  });

  it('DETAIL: viewer@HQ cannot open a GN customer', async () => {
    expect((await call(w.a.viewer, 'GET', `/records/customers/${w.r.customerB}`)).status).toBe(404);
  });

  it('SEARCH: viewer@HQ global search does not return GN records', async () => {
    const res = await call(w.a.viewer, 'GET', '/workspace/search?q=Kaloum');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('UPDATE: branch manager@GN cannot modify an HQ customer', async () => {
    expect(
      (
        await call(w.a.branchManager, 'PATCH', `/records/customers/${w.r.customerA}`, {
          name: 'cross-branch edit',
        })
      ).status,
    ).toBe(404);
  });

  it('CREATE: branch manager@GN cannot create records in HQ or without a branch', async () => {
    expect(
      (
        await call(w.a.branchManager, 'POST', '/records', {
          module: 'customers',
          type: 'company',
          name: 'HQ via GN',
          branchId: w.HQ,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(w.a.branchManager, 'POST', '/records', {
          module: 'customers',
          type: 'company',
          name: 'No branch',
        })
      ).status,
    ).toBe(403);
  });

  it('ARCHIVE: a branch-scoped role with archive capability cannot archive another branch’s record', async () => {
    const gnCustomerAdmin = await createActor(w.ght, 'company_admin', {
      alias: 'gnAdmin',
      branches: ['GN'],
    });
    expect(
      (await call(gnCustomerAdmin, 'DELETE', `/records/customers/${w.r.customerA}`)).status,
    ).toBe(404);
  });

  it('REPORT: branch manager@GN finance summary and dashboard include GN amounts only', async () => {
    const summary = await call(w.a.branchManager, 'GET', '/finance/summary');
    expect(summary.status).toBe(200);
    const usd = summary.body.invoices.find((g: { currency: string }) => g.currency === 'USD');
    expect(Number(usd._sum.total)).toBe(200);
    const dash = await call(w.a.branchManager, 'GET', '/workspace/dashboard');
    const receivable = dash.body.metrics.find((m: { key: string }) => m.key === 'receivables-USD');
    expect(receivable.value).toBe('200 USD');
  });

  it('INVENTORY: inventory manager@GN sees and moves GN stock only', async () => {
    const list = await call(w.a.inventory, 'GET', '/inventory/items');
    expect(ids(list)).toContain(gnItem);
    expect(ids(list)).not.toContain(hqItem);
    const move = await call(w.a.inventory, 'POST', `/inventory/items/${hqItem}/movements`, {
      type: 'PURCHASE_RECEIPT',
      quantity: 1,
      idempotencyKey: uid(),
    });
    expect(move.status).toBe(404);
  });

  it('ATTENDANCE: supervisor@GN neither sees nor approves an HQ shift', async () => {
    const list = await call(w.a.supervisor, 'GET', '/attendance');
    expect(ids(list)).not.toContain(hqPendingShift);
    expect(
      (await call(w.a.supervisor, 'POST', `/attendance/${hqPendingShift}/approve`)).status,
    ).toBe(400);
  });

  it('USERS: a branch-scoped administrator lists only users of their branch', async () => {
    const gnAdmin = await createActor(w.ght, 'company_admin', {
      alias: 'gnUsersAdmin',
      branches: ['GN'],
    });
    const users = await call(gnAdmin, 'GET', '/organization/users');
    expect(users.status).toBe(200);
    const branchSets = users.body.map((m: { branchIds: string[] }) => m.branchIds);
    expect(branchSets.every((b: string[]) => b.includes(w.GN))).toBe(true);
  });

  it('EXPORT: no export endpoint exists to test (recorded, not asserted)', async () => {
    const probe = await call(w.a.viewer, 'GET', '/reports/export');
    writeEvidence('branch-export-probe', { status: probe.status });
    expect(probe.status).toBe(404);
  });
});
