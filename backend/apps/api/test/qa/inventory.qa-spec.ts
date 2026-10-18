import { beforeAll, describe, expect, it } from 'vitest';
import { Prisma } from '@operix/database';
import { buildWorld, call, db, rec, uid, type World } from './harness';

/** Item → receipt → stock → issue → project → return / waste. */
let w: World;
let printingProject: string;
const move = (actor: World['a'][keyof World['a']], item: string, body: Record<string, unknown>) =>
  call(actor, 'POST', `/inventory/items/${item}/movements`, { idempotencyKey: uid(), ...body });
const newItem = async (name: string) =>
  (await call(w.a.inventory, 'POST', '/inventory/items', { code: `GN-${uid().slice(0, 8)}`, name, category: 'print', unit: 'm', currency: 'USD', branchId: w.GN, minimumStock: 5 })).body.id as string;
const quantity = async (id: string) => (await db().inventoryItem.findUniqueOrThrow({ where: { id } })).quantity.toString();

/** opening + Σ additions − Σ deductions must equal the cached balance. */
async function reconcile(itemId: string) {
  const item = await db().inventoryItem.findUniqueOrThrow({ where: { id: itemId } });
  const rows = await db().inventoryMovement.findMany({ where: { itemId }, orderBy: { createdAt: 'asc' } });
  const add = new Set(['INITIAL', 'PURCHASE_RECEIPT', 'RETURN', 'ADJUSTMENT']);
  const derived = rows.reduce((s, m) => (add.has(m.type) ? s.add(m.quantity) : s.sub(m.quantity)), new Prisma.Decimal(item.openingQuantity));
  return { cached: item.quantity.toString(), derived: derived.toString(), last: rows.at(-1)?.balanceAfter.toString() ?? '0', count: rows.length };
}

beforeAll(async () => {
  w = await buildWorld();
  printingProject = (await rec(w.a.owner, 'projects', 'Printing Project — Kaloum Retail', { branchId: w.GN, data: { customerId: w.r.customerB, kind: 'printing' } })).id;
});

describe('Inventory workflow', () => {
  it('receipt, project issue, return and waste reconcile with the movement ledger', async () => {
    const item = await newItem('Vinyl roll 1.52m');
    expect(await quantity(item)).toBe('0');
    expect((await move(w.a.inventory, item, { type: 'PURCHASE_RECEIPT', quantity: 10 })).status).toBe(201);
    const issue = await move(w.a.inventory, item, { type: 'ISSUE', quantity: 3, referenceType: 'project', referenceId: printingProject });
    expect(issue.status).toBe(201);
    expect(issue.body.referenceId).toBe(printingProject);
    expect((await move(w.a.inventory, item, { type: 'RETURN', quantity: 1, referenceType: 'project', referenceId: printingProject })).status).toBe(201);
    expect((await move(w.a.inventory, item, { type: 'WASTE', quantity: 1, notes: 'Misprint offcut' })).status).toBe(201);
    expect(await quantity(item)).toBe('7');
    const r = await reconcile(item);
    expect(r).toMatchObject({ cached: '7', derived: '7', last: '7', count: 4 });
  });

  it('rejects overdraw, zero and negative quantities without changing the balance', async () => {
    const item = await newItem('Eco-solvent ink cyan');
    await move(w.a.inventory, item, { type: 'PURCHASE_RECEIPT', quantity: 5 });
    expect((await move(w.a.inventory, item, { type: 'ISSUE', quantity: 6 })).status).toBe(400);
    expect((await move(w.a.inventory, item, { type: 'ISSUE', quantity: 0 })).status).toBe(400);
    expect((await move(w.a.inventory, item, { type: 'PURCHASE_RECEIPT', quantity: -3 })).status).toBe(400);
    expect((await move(w.a.inventory, item, { type: 'ISSUE', quantity: -3 })).status).toBe(400);
    expect(await quantity(item)).toBe('5');
    expect((await reconcile(item)).count).toBe(1);
  });

  it('adjustments require a reason; transfers and reservations are refused until their workflows exist', async () => {
    const item = await newItem('Aluminium frame profile');
    expect((await move(w.a.inventory, item, { type: 'ADJUSTMENT', quantity: 2 })).status).toBe(400);
    expect((await move(w.a.inventory, item, { type: 'ADJUSTMENT', quantity: 2, notes: 'Cycle count correction' })).status).toBe(201);
    expect((await move(w.a.inventory, item, { type: 'TRANSFER', quantity: 1 })).status).toBe(400);
    expect((await move(w.a.inventory, item, { type: 'RESERVATION', quantity: 1 })).status).toBe(400);
  });

  it('simultaneous issues never overdraw: 8 × 2 from 10 → exactly 5 succeed, balance 0', async () => {
    const item = await newItem('Frontlit banner 440gsm');
    await move(w.a.inventory, item, { type: 'PURCHASE_RECEIPT', quantity: 10 });
    const results = await Promise.all(Array.from({ length: 8 }, () => move(w.a.inventory, item, { type: 'ISSUE', quantity: 2 })));
    expect(results.every((r) => r.status < 500)).toBe(true);
    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    expect(await reconcile(item)).toMatchObject({ cached: '0', derived: '0', last: '0', count: 6 });
  });

  it('idempotency: a replayed movement is applied once; a reused key with a different body conflicts', async () => {
    const item = await newItem('Business card paper 350gsm');
    const key = uid();
    const a = await call(w.a.inventory, 'POST', `/inventory/items/${item}/movements`, { type: 'PURCHASE_RECEIPT', quantity: 4, idempotencyKey: key });
    const b = await call(w.a.inventory, 'POST', `/inventory/items/${item}/movements`, { type: 'PURCHASE_RECEIPT', quantity: 4, idempotencyKey: key });
    expect(b.body.id).toBe(a.body.id);
    const c = await call(w.a.inventory, 'POST', `/inventory/items/${item}/movements`, { type: 'PURCHASE_RECEIPT', quantity: 9, idempotencyKey: key });
    expect(c.status).toBe(409);
    expect(await quantity(item)).toBe('4');
  });

  it('a project reference from another branch is rejected', async () => {
    const hqProject = (await rec(w.a.owner, 'projects', 'Branding Project — Northwind', { branchId: w.HQ, data: { customerId: w.r.customerA } })).id;
    const item = await newItem('Laminate gloss');
    await move(w.a.inventory, item, { type: 'PURCHASE_RECEIPT', quantity: 3 });
    const res = await move(w.a.owner, item, { type: 'ISSUE', quantity: 1, referenceType: 'project', referenceId: hqProject });
    expect(res.status).toBe(400);
  });

  it('roles without stock capabilities cannot move stock', async () => {
    const item = await newItem('Mesh banner');
    expect((await move(w.a.employee, item, { type: 'PURCHASE_RECEIPT', quantity: 1 })).status).toBe(403);
    expect((await move(w.a.viewer, item, { type: 'ISSUE', quantity: 1 })).status).toBe(403);
    expect((await move(w.a.projectManager, item, { type: 'ISSUE', quantity: 1 })).status).toBe(403);
  });

  it('movement history can be read for an item (stock card)', async () => {
    const item = await newItem('Vinyl matte');
    expect((await call(w.a.inventory, 'GET', `/inventory/items/${item}/movements`)).status).toBe(200);
  });
});
