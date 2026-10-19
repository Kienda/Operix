import { describe, expect, it, vi } from 'vitest';
import { ProcurementApprovalController } from './procurement-approval.controller';

describe('procurement approval and sending', () => {
  const request = {
    auth: {
      organizationId: 'tenant-a',
      userId: 'approver',
      dataScope: 'branch',
      branchIds: ['branch-a'],
    },
  } as never;
  it('rejects self-approval of purchase requests', async () => {
    const tx = {
      businessRecord: {
        findFirst: vi.fn().mockResolvedValue({ status: 'DRAFT', createdBy: 'approver' }),
        update: vi.fn(),
      },
    };
    const controller = new ProcurementApprovalController({
      $transaction: async (work: (tx: unknown) => unknown) => work(tx),
    } as never);
    await expect(controller.approve('request', request)).rejects.toThrow(
      'different authorized user',
    );
    expect(tx.businessRecord.update).not.toHaveBeenCalled();
  });
  it('does not send a foreign purchase order', async () => {
    const tx = { businessRecord: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() } };
    const controller = new ProcurementApprovalController({
      $transaction: async (work: (tx: unknown) => unknown) => work(tx),
    } as never);
    await expect(controller.send('foreign', request)).rejects.toThrow('not found');
    expect(tx.businessRecord.update).not.toHaveBeenCalled();
    expect(tx.businessRecord.findFirst.mock.calls[0][0].where.AND[0]).toMatchObject({
      organizationId: 'tenant-a',
      branchId: { in: ['branch-a'] },
    });
  });
});
