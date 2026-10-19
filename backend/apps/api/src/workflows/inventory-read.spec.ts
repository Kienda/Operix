import { describe, expect, it, vi } from 'vitest';
import { InventoryController } from './inventory.controller';

describe('stock card scope', () => {
  const request = {
    auth: {
      organizationId: 'tenant-a',
      userId: 'user-a',
      dataScope: 'branch',
      branchIds: ['branch-a'],
    },
  } as never;
  it('denies a foreign or invisible item before reading movement history', async () => {
    const findFirst = vi.fn().mockResolvedValue(null),
      findMany = vi.fn();
    const controller = new InventoryController({
      inventoryItem: { findFirst },
      inventoryMovement: { findMany },
    } as never);
    await expect(controller.movements('foreign', request)).rejects.toThrow('not found');
    expect(findMany).not.toHaveBeenCalled();
    expect(findFirst.mock.calls[0][0].where.AND[0]).toEqual({
      organizationId: 'tenant-a',
      branchId: { in: ['branch-a'] },
    });
  });
  it('reads only the scoped item ledger', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const controller = new InventoryController({
      inventoryItem: { findFirst: vi.fn().mockResolvedValue({ id: 'item' }) },
      inventoryMovement: { findMany },
    } as never);
    await controller.movements('item', request);
    expect(findMany.mock.calls[0][0].where).toEqual({ organizationId: 'tenant-a', itemId: 'item' });
  });
});
