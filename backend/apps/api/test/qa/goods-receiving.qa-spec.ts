import { beforeAll, describe, expect, it } from 'vitest';
import { buildWorld, call, db, rec, uid, type World } from './harness';

let w: World;
beforeAll(async () => {
  w = await buildWorld();
});

async function item(branchId = w.GN) {
  const result = await call(w.a.owner, 'POST', '/inventory/items', {
    branchId,
    code: `GR-${uid()}`,
    name: 'Receiving test item',
    category: 'test',
    unit: 'each',
    currency: 'USD',
  });
  expect(result.status).toBe(201);
  return result.body.id as string;
}
async function order(items: { itemId: string; quantity: string }[]) {
  const row = await rec(w.a.owner, 'purchase-orders', 'Controlled receiving order', {
    branchId: w.GN,
    data: { items },
  });
  expect((await call(w.a.purchasing, 'POST', `/purchase-orders/${row.id}/send`)).status).toBe(201);
  return row.id;
}

describe('atomic purchase order receiving', () => {
  it('partial and concurrent receipts cannot exceed ordered quantity', async () => {
    const itemId = await item(),
      id = await order([{ itemId, quantity: '2' }]);
    const receive = () =>
      call(w.a.inventory, 'POST', `/records/purchase-orders/${id}/receive`, {
        idempotencyKey: uid(),
        items: [{ itemId, quantity: '1' }],
      });
    expect((await receive()).status).toBe(201);
    const results = await Promise.all([receive(), receive()]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 400]);
    expect(
      (await db().inventoryItem.findUniqueOrThrow({ where: { id: itemId } })).quantity.toFixed(),
    ).toBe('2');
    expect(await db().inventoryMovement.count({ where: { itemId } })).toBe(2);
    expect((await db().businessRecord.findUniqueOrThrow({ where: { id } })).status).toBe(
      'COMPLETED',
    );
  });
  it('a receipt containing an item outside the receiver branch commits no stock or order changes', async () => {
    const own = await item(),
      outside = await item(w.HQ);
    const id = await order([
      { itemId: own, quantity: '1' },
      { itemId: outside, quantity: '1' },
    ]);
    const result = await call(w.a.inventory, 'POST', `/records/purchase-orders/${id}/receive`, {
      idempotencyKey: uid(),
      items: [
        { itemId: own, quantity: '1' },
        { itemId: outside, quantity: '1' },
      ],
    });
    expect(result.status).toBe(404);
    expect(
      (await db().inventoryItem.findUniqueOrThrow({ where: { id: own } })).quantity.toFixed(),
    ).toBe('0');
    expect(await db().inventoryMovement.count({ where: { itemId: own } })).toBe(0);
    expect((await db().businessRecord.findUniqueOrThrow({ where: { id } })).status).toBe(
      'APPROVED',
    );
  });
  it('an employee cannot receive stock even with a valid order ID', async () => {
    const itemId = await item(),
      id = await order([{ itemId, quantity: '1' }]);
    const result = await call(w.a.employee, 'POST', `/records/purchase-orders/${id}/receive`, {
      idempotencyKey: uid(),
      items: [{ itemId, quantity: '1' }],
    });
    expect(result.status).toBe(403);
  });
});
