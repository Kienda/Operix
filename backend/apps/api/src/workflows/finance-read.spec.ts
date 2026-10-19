import { describe, expect, it, vi } from 'vitest';
import { FinanceController } from './finance.controller';

describe('scoped finance reads and verified receipts', () => {
  const request = {
    auth: {
      organizationId: 'tenant-a',
      userId: 'user-a',
      dataScope: 'branch',
      branchIds: ['branch-a'],
    },
  } as never;
  it('restricts list and direct-ID reads to the tenant and branch', async () => {
    const findMany = vi.fn().mockResolvedValue([]),
      findFirst = vi.fn().mockResolvedValue(null);
    const controller = new FinanceController({ invoice: { findMany, findFirst } } as never);
    await controller.listInvoices(request);
    expect(findMany.mock.calls[0][0].where).toEqual({
      organizationId: 'tenant-a',
      branchId: { in: ['branch-a'] },
    });
    await expect(controller.getInvoice('foreign-id', request)).rejects.toThrow('not found');
    expect(findFirst.mock.calls[0][0].where.AND[0]).toEqual(findMany.mock.calls[0][0].where);
    expect(findMany.mock.calls[0][0].select).not.toHaveProperty('data');
  });
  it('cannot produce a receipt for an invisible or unverified payment', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    await expect(
      new FinanceController({ payment: { findFirst } } as never).receipt('payment', request),
    ).rejects.toThrow('Verified payment not found');
    expect(findFirst.mock.calls[0][0].where.AND[1]).toEqual({ id: 'payment', status: 'VERIFIED' });
  });
  it('produces a stable numbered receipt without internal verification identities', async () => {
    const row = {
      id: 'payment',
      number: 'PAY-1',
      customerId: 'customer',
      amount: '10',
      currency: 'USD',
      verifiedAt: new Date(),
      verifiedBy: 'internal-id',
      proofUrl: 'private-proof',
      allocations: [],
    };
    const controller = new FinanceController({
      payment: { findFirst: vi.fn().mockResolvedValue(row) },
    } as never);
    const first = await controller.receipt('payment', request);
    expect(first).toEqual(await controller.receipt('payment', request));
    expect(first.number).toBe('RCT-PAY-1');
    expect(first).not.toHaveProperty('verifiedBy');
    expect(first).not.toHaveProperty('proofUrl');
  });
});
