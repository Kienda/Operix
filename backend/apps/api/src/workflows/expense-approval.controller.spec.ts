import { describe, expect, it, vi } from 'vitest';
import { ExpenseApprovalController } from './expense-approval.controller';

describe('expense approval controls', () => {
  const request = {
    auth: {
      organizationId: 'tenant-a',
      userId: 'approver',
      dataScope: 'branch',
      branchIds: ['branch-a'],
    },
  } as never;
  it.each([
    null,
    { createdBy: 'approver', status: 'DRAFT' },
    { createdBy: 'other', status: 'COMPLETED' },
  ])('rejects invisible, self-approved or invalid-state expenses', async (row) => {
    const tx = {
      businessRecord: { findFirst: vi.fn().mockResolvedValue(row), update: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const controller = new ExpenseApprovalController({
      $transaction: async (work: (tx: unknown) => unknown) => work(tx),
    } as never);
    await expect(controller.approve('expense', request)).rejects.toThrow();
    expect(tx.businessRecord.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(tx.businessRecord.findFirst.mock.calls[0][0].where.AND[0]).toMatchObject({
      organizationId: 'tenant-a',
      branchId: { in: ['branch-a'] },
    });
  });
});
