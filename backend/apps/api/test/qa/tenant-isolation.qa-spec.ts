import { beforeAll, describe, expect, it } from 'vitest';
import { buildWorld, call, invoice, paymentBody, uid, type World } from './harness';

/** Atlas exists only to prove that GHT and Atlas can never reach each other's data. */
let w: World;
let atlasItem: string;
let atlasPayment: string;
let ghtInvoice: string;

beforeAll(async () => {
  w = await buildWorld();
  const item = await call(w.a.atlasAdmin, 'POST', '/inventory/items', {
    code: 'AT-VINYL',
    name: 'Atlas vinyl',
    category: 'print',
    unit: 'm',
    currency: 'USD',
    branchId: w.AT,
  });
  atlasItem = item.body.id;
  const pay = await call(
    w.a.atlasAdmin,
    'POST',
    '/finance/payments',
    paymentBody(w.r.atlasCustomer, w.AT, 100, [{ invoiceId: w.r.atlasInvoice, amount: 100 }]),
  );
  atlasPayment = pay.body.id;
  ghtInvoice = (await invoice(w.a.owner, w.r.customerA, w.HQ, 100)).id;
});

describe('Tenant isolation over direct API requests', () => {
  it('a GHT token with the Atlas organization header is rejected on every surface', async () => {
    for (const path of [
      '/records/customers',
      '/workspace/dashboard',
      '/finance/summary',
      '/inventory/items',
      '/attendance',
      '/organization',
    ])
      expect(
        (await call(w.a.owner, 'GET', path, undefined, { orgId: w.atlas.id })).status,
        path,
      ).toBe(403);
  });

  it('GHT cannot read, update or archive an Atlas record by ID', async () => {
    expect((await call(w.a.owner, 'GET', `/records/customers/${w.r.atlasCustomer}`)).status).toBe(
      404,
    );
    expect(
      (
        await call(w.a.owner, 'PATCH', `/records/customers/${w.r.atlasCustomer}`, {
          name: 'hijack',
        })
      ).status,
    ).toBe(404);
    expect(
      (await call(w.a.owner, 'DELETE', `/records/customers/${w.r.atlasCustomer}`)).status,
    ).toBe(404);
    expect((await call(w.a.owner, 'GET', `/records/projects/${w.r.atlasProject}`)).status).toBe(
      404,
    );
    expect(
      (
        await call(w.a.owner, 'POST', `/projects/${w.r.atlasProject}/start`, {
          overrideReason: 'cross-tenant probe',
        })
      ).status,
    ).toBe(404);
  });

  it('Atlas cannot read GHT records by ID, list or search', async () => {
    expect((await call(w.a.atlasAdmin, 'GET', `/records/customers/${w.r.customerA}`)).status).toBe(
      404,
    );
    const list = await call(w.a.atlasAdmin, 'GET', '/records/customers?limit=100');
    expect(list.body.data.map((r: { id: string }) => r.id)).not.toContain(w.r.customerA);
    const search = await call(w.a.atlasAdmin, 'GET', '/workspace/search?q=Northwind');
    expect(search.body.data).toEqual([]);
  });

  it('GHT cannot attach Atlas branches, customers or invoices to its own writes', async () => {
    const branch = await call(w.a.owner, 'POST', '/records', {
      module: 'customers',
      type: 'company',
      name: 'Foreign branch',
      branchId: w.AT,
    });
    expect(branch.status).toBeGreaterThanOrEqual(400);
    expect(branch.status).toBeLessThan(500);
    const ref = await call(w.a.owner, 'POST', '/records', {
      module: 'projects',
      type: 'project',
      name: 'Foreign customer ref',
      branchId: w.HQ,
      data: { customerId: w.r.atlasCustomer },
    });
    expect(ref.status).toBe(400);
    const inv = await call(w.a.owner, 'POST', '/finance/invoices', {
      customerId: w.r.atlasCustomer,
      branchId: w.HQ,
      number: `X-${uid()}`,
      currency: 'USD',
      subtotal: 10,
      tax: 0,
    });
    expect(inv.status).toBe(400);
    const pay = await call(
      w.a.owner,
      'POST',
      '/finance/payments',
      paymentBody(w.r.customerA, w.HQ, 10, [{ invoiceId: w.r.atlasInvoice, amount: 10 }]),
    );
    expect(pay.status).toBe(400);
  });

  it('GHT cannot verify an Atlas payment or move Atlas stock', async () => {
    expect(
      (await call(w.a.finance, 'POST', `/finance/payments/${atlasPayment}/verify`)).status,
    ).toBe(404);
    const move = await call(w.a.owner, 'POST', `/inventory/items/${atlasItem}/movements`, {
      type: 'PURCHASE_RECEIPT',
      quantity: 5,
      idempotencyKey: uid(),
    });
    expect(move.status).toBe(404);
  });

  it('GHT cannot invite a user with an Atlas role', async () => {
    const roles = await call(w.a.atlasAdmin, 'GET', '/organization/roles');
    const atlasRole = roles.body.find((r: { name: string }) => r.name === 'Company Administrator');
    const invite = await call(w.a.owner, 'POST', '/organization/invitations', {
      email: `x-${uid().slice(0, 6)}@qa.operix.test`,
      roleId: atlasRole.id,
    });
    expect(invite.status).toBe(400);
  });

  it('financial aggregates contain only the caller tenant', async () => {
    const summary = await call(w.a.owner, 'GET', '/finance/summary');
    expect(summary.status).toBe(200);
    const usd = summary.body.invoices.find((g: { currency: string }) => g.currency === 'USD');
    expect(Number(usd._sum.total)).toBe(100); // GHT invoice only; Atlas USD 500 excluded
    expect(ghtInvoice).toBeTruthy();
  });

  it('a customer of one tenant cannot reach the other tenant', async () => {
    expect(
      (await call(w.a.atlasCustomer, 'GET', '/records/customers', undefined, { orgId: w.ght.id }))
        .status,
    ).toBe(403);
    expect(
      (await call(w.a.customer, 'GET', `/records/customers/${w.r.atlasCustomer}`)).status,
    ).toBeGreaterThanOrEqual(403);
  });
});
