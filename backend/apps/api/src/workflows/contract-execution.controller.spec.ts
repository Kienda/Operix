import { describe, expect, it, vi } from 'vitest';
import { ContractExecutionController } from './contract-execution.controller';

describe('executed contract gate', () => {
  const request = {
    auth: { organizationId: 'tenant-a', userId: 'owner', dataScope: 'all', branchIds: [] },
  } as never;
  it('cannot countersign without an attached signed document', async () => {
    const tx = {
      businessRecord: {
        findFirst: vi.fn().mockResolvedValue({ status: 'PENDING', data: {} }),
        update: vi.fn(),
      },
    };
    const controller = new ContractExecutionController({
      $transaction: async (work: (tx: unknown) => unknown) => work(tx),
    } as never);
    await expect(controller.countersign('contract', request)).rejects.toThrow('signed document');
    expect(tx.businessRecord.update).not.toHaveBeenCalled();
  });
  it('rejects a signed document from another branch', async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({ status: 'APPROVED', branchId: 'a', data: {} })
      .mockResolvedValueOnce({ branchId: 'b' });
    const tx = { businessRecord: { findFirst, update: vi.fn() } };
    const controller = new ContractExecutionController({
      $transaction: async (work: (tx: unknown) => unknown) => work(tx),
    } as never);
    await expect(
      controller.attach('contract', { documentId: 'document' }, request),
    ).rejects.toThrow('contract branch');
    expect(tx.businessRecord.update).not.toHaveBeenCalled();
  });
});
