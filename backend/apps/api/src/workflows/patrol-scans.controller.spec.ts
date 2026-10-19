import { describe, expect, it, vi } from 'vitest';
import { PatrolScansController } from './patrol-scans.controller';

describe('patrol scan scope and shift controls', () => {
  const request = {
    auth: {
      organizationId: 'tenant-a',
      userId: 'guard',
      dataScope: 'self',
      branchIds: ['branch-a'],
    },
  } as never;
  const body = { checkpointId: 'point', patrolId: 'patrol', idempotencyKey: 'key' };
  it('rejects foreign checkpoints before recording a scan', async () => {
    const tx = { businessRecord: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() } };
    const controller = new PatrolScansController({
      $transaction: async (work: (tx: unknown) => unknown) => work(tx),
    } as never);
    await expect(controller.scan(body, request)).rejects.toThrow('not found');
    expect(tx.businessRecord.create).not.toHaveBeenCalled();
    expect(tx.businessRecord.findFirst.mock.calls[0][0].where).toMatchObject({
      organizationId: 'tenant-a',
      branchId: { in: ['branch-a'] },
    });
  });
  it('requires an active assignment to the specific site and time window', async () => {
    const tx = {
      businessRecord: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ id: 'point', branchId: 'branch-a', data: { siteId: 'site' } })
          .mockResolvedValueOnce({
            id: 'patrol',
            branchId: 'branch-a',
            data: { siteId: 'site', checkpointIds: ['point'] },
          }),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
      },
    };
    const controller = new PatrolScansController({
      $transaction: async (work: (tx: unknown) => unknown) => work(tx),
    } as never);
    await expect(controller.scan(body, request)).rejects.toThrow('active assignment');
    expect(tx.businessRecord.create).not.toHaveBeenCalled();
  });
});
