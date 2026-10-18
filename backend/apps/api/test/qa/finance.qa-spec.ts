import { beforeAll, describe, expect, it } from 'vitest';
import { buildWorld, call, db, invoice, paymentBody, type World } from './harness';

/** Invoice → payment → verification → allocation → balance → receipt. */
let w: World;
const paid = async (id: string) => (await db().invoice.findUniqueOrThrow({ where: { id } })).paid.toString();
const ledger = async (invoiceId: string) => {
  const sum = await db().paymentAllocation.aggregate({ where: { invoiceId, payment: { status: 'VERIFIED' } }, _sum: { amount: true } });
  return (sum._sum.amount ?? 0).toString();
};

beforeAll(async () => {
  w = await buildWorld();
});

describe('Finance workflow', () => {
  it('partial then full payment: pending does not reduce balance, verification does', async () => {
    const inv = await invoice(w.a.accountant, w.r.customerA, w.HQ, 100);
    expect(inv.status).toBe('DRAFT');
    const p1 = await call(w.a.accountant, 'POST', '/finance/payments', paymentBody(w.r.customerA, w.HQ, 40, [{ invoiceId: inv.id, amount: 40 }]));
    expect(p1.status).toBe(201);
    expect(p1.body.status).toBe('PENDING_VERIFICATION');
    expect(await paid(inv.id)).toBe('0');
    const v1 = await call(w.a.finance, 'POST', `/finance/payments/${p1.body.id}/verify`);
    expect(v1.status).toBe(201);
    expect(v1.body.status).toBe('VERIFIED');
    expect(await paid(inv.id)).toBe('40');
    expect((await db().invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe('PARTIAL');

    const p2 = await call(w.a.accountant, 'POST', '/finance/payments', paymentBody(w.r.customerA, w.HQ, 60, [{ invoiceId: inv.id, amount: 60 }]));
    await call(w.a.finance, 'POST', `/finance/payments/${p2.body.id}/verify`);
    const after = await db().invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(after.paid.toString()).toBe('100');
    expect(after.status).toBe('PAID');
    expect(await ledger(inv.id)).toBe('100');
  });

  it('overpayment of a paid invoice is rejected and the balance is unchanged', async () => {
    const inv = await invoice(w.a.accountant, w.r.customerA, w.HQ, 50);
    const full = await call(w.a.accountant, 'POST', '/finance/payments', paymentBody(w.r.customerA, w.HQ, 50, [{ invoiceId: inv.id, amount: 50 }]));
    await call(w.a.finance, 'POST', `/finance/payments/${full.body.id}/verify`);
    const extra = await call(w.a.accountant, 'POST', '/finance/payments', paymentBody(w.r.customerA, w.HQ, 10, [{ invoiceId: inv.id, amount: 10 }]));
    if (extra.status === 201) expect((await call(w.a.finance, 'POST', `/finance/payments/${extra.body.id}/verify`)).status).toBe(400);
    else expect(extra.status).toBe(400);
    expect(await paid(inv.id)).toBe('50');
  });

  it('rejects negative, zero and over-precise amounts', async () => {
    const inv = await invoice(w.a.accountant, w.r.customerA, w.HQ, 100);
    for (const [amount, alloc] of [[-10, -10], [0, 0], [10, -5], [10, 0], ['10.001', '10.001']] as const) {
      const res = await call(w.a.accountant, 'POST', '/finance/payments', paymentBody(w.r.customerA, w.HQ, amount, [{ invoiceId: inv.id, amount: alloc }]));
      expect(res.status, `amount=${amount} allocation=${alloc}`).toBe(400);
    }
    const neg = await call(w.a.accountant, 'POST', '/finance/invoices', { customerId: w.r.customerA, branchId: w.HQ, number: 'NEG-1', currency: 'USD', subtotal: -1, tax: 0 });
    expect(neg.status).toBe(400);
  });

  it('rejects allocations that exceed the payment amount', async () => {
    const inv = await invoice(w.a.accountant, w.r.customerA, w.HQ, 100);
    const res = await call(w.a.accountant, 'POST', '/finance/payments', paymentBody(w.r.customerA, w.HQ, 10, [{ invoiceId: inv.id, amount: 20 }]));
    expect(res.status).toBe(400);
  });

  it('rejects the wrong customer and the wrong currency', async () => {
    const inv = await invoice(w.a.owner, w.r.customerB, w.GN, 100);
    const wrongCustomer = await call(w.a.owner, 'POST', '/finance/payments', paymentBody(w.r.customerC, w.GN, 10, [{ invoiceId: inv.id, amount: 10 }]));
    expect(wrongCustomer.status).toBe(400);
    const wrongCurrency = await call(w.a.owner, 'POST', '/finance/payments', paymentBody(w.r.customerB, w.GN, 10, [{ invoiceId: inv.id, amount: 10 }], 'EUR'));
    expect(wrongCurrency.status).toBe(400);
  });

  it('rejects an invoice for a nonexistent customer', async () => {
    const res = await call(w.a.owner, 'POST', '/finance/invoices', { customerId: '00000000-0000-4000-8000-000000000000', branchId: w.HQ, number: 'GHOST-1', currency: 'USD', subtotal: 10, tax: 0 });
    expect(res.status).toBe(400);
  });

  it('a duplicate request is idempotent; reusing a number for a different payment conflicts', async () => {
    const inv = await invoice(w.a.accountant, w.r.customerA, w.HQ, 100);
    const body = paymentBody(w.r.customerA, w.HQ, 25, [{ invoiceId: inv.id, amount: 25 }]);
    const first = await call(w.a.accountant, 'POST', '/finance/payments', body);
    const replay = await call(w.a.accountant, 'POST', '/finance/payments', body);
    expect(first.status).toBe(201);
    expect(replay.body.id).toBe(first.body.id);
    const conflict = await call(w.a.accountant, 'POST', '/finance/payments', { ...body, amount: 30, allocations: [{ invoiceId: inv.id, amount: 30 }] });
    expect(conflict.status).toBe(409);
    expect(await db().payment.count({ where: { number: body.number } })).toBe(1);
  });

  it('concurrent verification never overpays and the cached balance equals the ledger', async () => {
    const inv = await invoice(w.a.accountant, w.r.customerA, w.HQ, 100);
    const ids: string[] = [];
    for (let i = 0; i < 8; i++)
      ids.push((await call(w.a.accountant, 'POST', '/finance/payments', paymentBody(w.r.customerA, w.HQ, 20, [{ invoiceId: inv.id, amount: 20 }]))).body.id);
    const results = await Promise.all(ids.map((id) => call(w.a.finance, 'POST', `/finance/payments/${id}/verify`)));
    expect(results.every((r) => r.status < 500)).toBe(true);
    const verified = await db().payment.count({ where: { id: { in: ids }, status: 'VERIFIED' } });
    expect(verified).toBe(5);
    expect(await paid(inv.id)).toBe('100');
    expect(await ledger(inv.id)).toBe('100');
  });

  it('verifying the same payment twice concurrently counts it once', async () => {
    const inv = await invoice(w.a.accountant, w.r.customerA, w.HQ, 100);
    const p = await call(w.a.accountant, 'POST', '/finance/payments', paymentBody(w.r.customerA, w.HQ, 30, [{ invoiceId: inv.id, amount: 30 }]));
    await Promise.all([1, 2, 3].map(() => call(w.a.finance, 'POST', `/finance/payments/${p.body.id}/verify`)));
    expect(await paid(inv.id)).toBe('30');
  });

  it('summaries are grouped per currency, never summed across currencies', async () => {
    await invoice(w.a.owner, w.r.customerB, w.GN, 1500000, 'GNF');
    const res = await call(w.a.finance, 'GET', '/finance/summary');
    const currencies = res.body.invoices.map((g: { currency: string }) => g.currency);
    expect(currencies).toEqual(expect.arrayContaining(['USD', 'GNF']));
  });

  it('role separation: a sales representative may record but not verify; finance-blind roles cannot read summaries', async () => {
    const inv = await invoice(w.a.owner, w.r.customerA, w.HQ, 10);
    const rep = await call(w.a.sales, 'POST', '/finance/payments', paymentBody(w.r.customerA, w.HQ, 10, []));
    expect(rep.status).toBe(201);
    expect((await call(w.a.sales, 'POST', `/finance/payments/${rep.body.id}/verify`)).status).toBe(403);
    expect((await call(w.a.viewer, 'GET', '/finance/summary')).status).toBe(403);
    expect(inv.id).toBeTruthy();
  });

  it('invoices and payments can be listed and opened (finance UI needs read endpoints)', async () => {
    expect((await call(w.a.finance, 'GET', '/finance/invoices')).status).toBe(200);
    expect((await call(w.a.finance, 'GET', '/finance/payments')).status).toBe(200);
  });

  it('a verified payment produces a numbered receipt', async () => {
    const inv = await invoice(w.a.accountant, w.r.customerA, w.HQ, 10);
    const p = await call(w.a.accountant, 'POST', '/finance/payments', paymentBody(w.r.customerA, w.HQ, 10, [{ invoiceId: inv.id, amount: 10 }]));
    await call(w.a.finance, 'POST', `/finance/payments/${p.body.id}/verify`);
    const receipt = await call(w.a.finance, 'GET', `/finance/payments/${p.body.id}/receipt`);
    expect(receipt.status).toBe(200);
  });
});
