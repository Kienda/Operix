import { describe, expect, it, vi } from 'vitest';
import { LeadConversionController } from './lead-conversion.controller';

describe('lead conversion invariants', () => {
  const request = {
    auth: {
      organizationId: 'tenant-a',
      userId: 'user-a',
      dataScope: 'assigned',
      branchIds: ['branch-a'],
      permissions: [],
    },
  } as never;
  it('rejects an invisible lead without creating a customer', async () => {
    const tx = { businessRecord: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() } };
    const controller = new LeadConversionController({
      $transaction: async (work: (tx: unknown) => unknown) => work(tx),
    } as never);
    await expect(controller.convert('foreign', request)).rejects.toThrow('not found');
    expect(tx.businessRecord.create).not.toHaveBeenCalled();
    expect(tx.businessRecord.findFirst.mock.calls[0][0].where.AND[0]).toMatchObject({
      organizationId: 'tenant-a',
      branchId: { in: ['branch-a'] },
    });
  });
  it('rejects unqualified leads without writing', async () => {
    const tx = {
      businessRecord: {
        findFirst: vi.fn().mockResolvedValue({ data: { stage: 'new' } }),
        create: vi.fn(),
      },
    };
    const controller = new LeadConversionController({
      $transaction: async (work: (tx: unknown) => unknown) => work(tx),
    } as never);
    await expect(controller.convert('lead', request)).rejects.toThrow('Qualify');
    expect(tx.businessRecord.create).not.toHaveBeenCalled();
  });
});
