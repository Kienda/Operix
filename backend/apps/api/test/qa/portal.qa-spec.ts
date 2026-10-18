import { beforeAll, describe, expect, it } from 'vitest';
import { buildWorld, call, invoice, rec, type World } from './harness';

/** Customer portal: a customer sees only their own commercial records. */
let w: World;
let quoteA: string, quoteB: string, projectA: string, projectB: string;
beforeAll(async () => {
  w = await buildWorld();
  quoteA = (
    await rec(w.a.owner, 'quotations', 'QT — Northwind signage', {
      branchId: w.HQ,
      data: { customerId: w.r.customerA },
    })
  ).id;
  quoteB = (
    await rec(w.a.owner, 'quotations', 'QT — Kaloum banners', {
      branchId: w.GN,
      data: { customerId: w.r.customerB },
    })
  ).id;
  projectA = (
    await rec(w.a.owner, 'projects', 'Signage Installation — Northwind', {
      branchId: w.HQ,
      data: { customerId: w.r.customerA },
    })
  ).id;
  projectB = (
    await rec(w.a.owner, 'projects', 'Printing Project — Kaloum', {
      branchId: w.GN,
      data: { customerId: w.r.customerB },
    })
  ).id;
  await invoice(w.a.owner, w.r.customerA, w.HQ, 300);
});

describe('Customer portal', () => {
  for (const module of ['quotations', 'projects']) {
    it(`customer A can list their own ${module}`, async () => {
      const res = await call(w.a.customer, 'GET', `/records/${module}`);
      expect(res.status).toBe(200);
    });
  }
  it('customer A never receives customer B records (direct ID)', async () => {
    for (const [module, id] of [
      ['quotations', quoteB],
      ['projects', projectB],
      ['customers', w.r.customerB],
    ] as const) {
      const res = await call(w.a.customer, 'GET', `/records/${module}/${id}`);
      expect([403, 404], module).toContain(res.status);
    }
  });
  it('customer A can see their own invoices', async () => {
    const res = await call(w.a.customer, 'GET', '/finance/invoices');
    expect(res.status).toBe(200);
  });
  it('customer A cannot read internal data (employees, finance summary, inventory)', async () => {
    for (const path of [
      '/records/employees',
      '/finance/summary',
      '/inventory/items',
      '/attendance',
    ])
      expect((await call(w.a.customer, 'GET', path)).status, path).toBe(403);
    expect([quoteA, projectA].length).toBe(2);
  });
});
