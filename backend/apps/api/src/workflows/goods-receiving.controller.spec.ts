import { describe, expect, it, vi } from 'vitest';
const posting = vi.hoisted(() => vi.fn());
vi.mock('./inventory.controller', () => ({ postStockMovement: posting }));
import { GoodsReceivingController } from './goods-receiving.controller';

describe('goods receiving integrity', () => {
  const request = {
    auth: {
      organizationId: 'tenant-a',
      userId: 'receiver',
      dataScope: 'branch',
      branchIds: ['branch-a'],
    },
  } as never;
  function controller(row: unknown) {
    const tx = {
      businessRecord: { findFirst: vi.fn().mockResolvedValue(row), update: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    return {
      tx,
      api: new GoodsReceivingController({
        $transaction: async (work: (tx: unknown) => unknown) => work(tx),
      } as never),
    };
  }
  it('rejects over-receipt before any stock posting', async () => {
    posting.mockClear();
    const { api, tx } = controller({
      status: 'APPROVED',
      data: {
        items: [{ itemId: 'item', quantity: '3' }],
        receipts: [{ idempotencyKey: 'old', items: [{ itemId: 'item', quantity: '2' }] }],
      },
    });
    await expect(
      api.receive(
        'order',
        { idempotencyKey: 'new', items: [{ itemId: 'item', quantity: '2' }] },
        request,
      ),
    ).rejects.toThrow('exceeds');
    expect(posting).not.toHaveBeenCalled();
    expect(tx.businessRecord.update).not.toHaveBeenCalled();
  });
  it('rejects invisible orders without accessing the stock ledger', async () => {
    posting.mockClear();
    const { api } = controller(null);
    await expect(
      api.receive('foreign', { idempotencyKey: 'key', items: [] }, request),
    ).rejects.toThrow('not found');
    expect(posting).not.toHaveBeenCalled();
  });
  it('treats changed replay quantities as an idempotency conflict', async () => {
    const { api } = controller({
      status: 'COMPLETED',
      data: {
        items: [{ itemId: 'item', quantity: '3' }],
        receipts: [{ idempotencyKey: 'key', items: [{ itemId: 'item', quantity: '3' }] }],
      },
    });
    await expect(
      api.receive(
        'order',
        { idempotencyKey: 'key', items: [{ itemId: 'item', quantity: '2' }] },
        request,
      ),
    ).rejects.toThrow('different quantities');
  });
});
