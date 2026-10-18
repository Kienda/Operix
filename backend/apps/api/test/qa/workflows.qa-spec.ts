import { beforeAll, describe, expect, it } from 'vitest';
import { buildWorld, call, db, invoice, paymentBody, rec, uid, type World } from './harness';

/**
 * Primary commercial chain and project/procurement workflows, step by step.
 * Each step asserts the intended behaviour; a failing step marks where the
 * workflow currently stops. Later steps continue from workarounds so every
 * gap is reported, not just the first one.
 */
let w: World;
beforeAll(async () => {
  w = await buildWorld();
});

describe.sequential('Commercial: Lead → Customer → Quote → Contract → Project → Invoice → Payment → Receipt', () => {
  const s: Record<string, string> = {};

  it('1. sales rep creates a lead (stage new)', async () => {
    const lead = await call(w.a.sales, 'POST', '/records', { module: 'leads', type: 'lead', name: 'Conakry Port Authority — website', branchId: w.HQ, data: { stage: 'new', source: 'referral', assignedToUserId: w.a.sales.userId, estimatedValue: '12000.00', currency: 'USD' } });
    expect(lead.status).toBe(201);
    s.lead = lead.body.id;
  });

  it('2. sales rep qualifies the lead', async () => {
    const res = await call(w.a.sales, 'PATCH', `/records/leads/${s.lead}`, { status: 'ACTIVE', data: { stage: 'qualified' } });
    expect(res.status).toBe(200);
    expect(res.body.data.stage).toBe('qualified');
  });

  it('3. the qualified lead converts into a customer (leads.convert)', async () => {
    const res = await call(w.a.sales, 'POST', `/records/leads/${s.lead}/convert`, {});
    expect(res.status).toBe(201);
  });

  it('3b. workaround: sales rep creates the customer manually', async () => {
    const res = await call(w.a.sales, 'POST', '/records', { module: 'customers', type: 'company', name: 'Conakry Port Authority', branchId: w.HQ, data: { salespersonUserId: w.a.sales.userId } });
    expect(res.status).toBe(201);
    s.customer = res.body.id;
  });

  it('4. sales rep creates a quotation for the customer', async () => {
    const res = await call(w.a.sales, 'POST', '/records', { module: 'quotations', type: 'quotation', name: 'QT — Website Development', branchId: w.HQ, data: { customerId: s.customer, currency: 'USD', total: '12000.00' } });
    expect(res.status).toBe(201);
    s.quote = res.body.id;
  });

  it('5a. a sales rep (no quotations.approve) cannot approve the quotation', async () => {
    const res = await call(w.a.sales, 'PATCH', `/records/quotations/${s.quote}`, { status: 'APPROVED' });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('5b. a sales manager (quotations.approve) can approve the quotation', async () => {
    const res = await call(w.a.salesManager, 'PATCH', `/records/quotations/${s.quote}`, { status: 'APPROVED' });
    expect(res.status).toBe(200);
  });

  it('6. a project is created for the customer with a contract gate', async () => {
    const res = await call(w.a.projectManager, 'POST', '/records', { module: 'projects', type: 'client_project', name: 'Website Development — Port Authority', branchId: w.HQ, data: { customerId: s.customer, quotationId: s.quote, kind: 'software', contractRequirement: 'before_work_starts', projectManagerUserId: w.a.projectManager.userId } });
    expect(res.status).toBe(201);
    s.project = res.body.id;
  });

  it('6b. workaround: the sales rep assigns the project manager on the customer, then the project is created', async () => {
    const assign = await call(w.a.sales, 'PATCH', `/records/customers/${s.customer}`, { data: { projectManagerUserId: w.a.projectManager.userId } });
    expect(assign.status).toBe(200);
    const res = await call(w.a.projectManager, 'POST', '/records', { module: 'projects', type: 'client_project', name: 'Website Development — Port Authority', branchId: w.HQ, data: { customerId: s.customer, kind: 'software', contractRequirement: 'before_work_starts', projectManagerUserId: w.a.projectManager.userId } });
    expect(res.status).toBe(201);
    s.project = res.body.id;
  });

  it('6c. the project manager links the project to its quotation', async () => {
    const res = await call(w.a.projectManager, 'PATCH', `/records/projects/${s.project}`, { data: { quotationId: s.quote } });
    expect(res.status).toBe(200);
  });

  it('7a. a contract linked to the project is created', async () => {
    const res = await call(w.a.sales, 'POST', '/records', { module: 'contracts', type: 'service_contract', name: 'Website delivery agreement', branchId: w.HQ, data: { customerId: s.customer, projectId: s.project, value: '12000.00', currency: 'USD' } });
    expect(res.status).toBe(201);
    s.contract = res.body.id;
  });

  it('7b. the contract can be executed (approved/countersigned → completed)', async () => {
    const res = await call(w.a.owner, 'PATCH', `/records/contracts/${s.contract}`, { status: 'COMPLETED' });
    expect(res.status).toBe(200);
  });

  it('8a. the project cannot start without an executed contract', async () => {
    expect((await call(w.a.projectManager, 'POST', `/projects/${s.project}/start`, {})).status).toBe(400);
  });

  it('8b. generic PATCH cannot bypass the start gate, change the gate, or archive (FLOW-01)', async () => {
    expect((await call(w.a.owner, 'PATCH', `/records/projects/${s.project}`, { status: 'IN_PROGRESS' })).status).toBe(400);
    expect((await call(w.a.owner, 'PATCH', `/records/projects/${s.project}`, { data: { contractRequirement: 'not_required' } })).status).toBe(400);
    expect((await call(w.a.owner, 'PATCH', `/records/customers/${s.customer}`, { status: 'ARCHIVED' })).status).toBe(400);
    const project = await db().businessRecord.findUniqueOrThrow({ where: { id: s.project } });
    expect(project.status).toBe('DRAFT');
  });

  it('8c. an override needs contracts.override_gate and a reason, and is audited', async () => {
    expect((await call(w.a.admin, 'POST', `/projects/${s.project}/start`, { overrideReason: 'Customer signed on paper, scan pending' })).status).toBe(403);
    const ok = await call(w.a.owner, 'POST', `/projects/${s.project}/start`, { overrideReason: 'Customer signed on paper, scan pending' });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('IN_PROGRESS');
    expect(await db().auditLog.count({ where: { action: 'CONTRACT_GATE_OVERRIDE', resourceId: s.project } })).toBe(1);
  });

  it('9. invoice → payment → verification settles the invoice', async () => {
    const inv = await invoice(w.a.accountant, s.customer, w.HQ, 12000);
    const pay = await call(w.a.accountant, 'POST', '/finance/payments', paymentBody(s.customer, w.HQ, 12000, [{ invoiceId: inv.id, amount: 12000 }]));
    expect(pay.status).toBe(201);
    const v = await call(w.a.finance, 'POST', `/finance/payments/${pay.body.id}/verify`);
    expect(v.status).toBe(201);
    expect((await db().invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe('PAID');
    s.payment = pay.body.id;
  });

  it('10. a receipt is issued for the verified payment', async () => {
    expect((await call(w.a.accountant, 'GET', `/finance/payments/${s.payment}/receipt`)).status).toBe(200);
  });

  it('rejects an unknown status with a sanitized 400, not a 500 (API-01)', async () => {
    const res = await call(w.a.owner, 'PATCH', `/records/customers/${s.customer}`, { status: 'WON' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/prisma|BusinessRecord/i);
  });
});

describe.sequential('Project delivery: Team → Tasks → Milestones → Materials → Expenses → Completion', () => {
  const s: Record<string, string> = {};
  it('setup: started project without a contract requirement', async () => {
    s.project = (await rec(w.a.projectManager, 'projects', 'Branding Project — Northwind', { branchId: w.HQ, data: { customerId: w.r.customerA, kind: 'marketing', projectManagerUserId: w.a.projectManager.userId } })).id;
    expect((await call(w.a.projectManager, 'POST', `/projects/${s.project}/start`, {})).status).toBe(201);
  });
  it('team: the project manager adds team members', async () => {
    const res = await call(w.a.projectManager, 'PATCH', `/records/projects/${s.project}`, { data: { memberUserIds: [w.a.employee.userId] } });
    expect(res.status).toBe(200);
  });
  it('tasks: the project manager assigns a task to a team member', async () => {
    const res = await call(w.a.projectManager, 'POST', '/records', { module: 'tasks', type: 'task', name: 'Logo concepts', branchId: w.HQ, data: { projectId: s.project, assigneeUserId: w.a.employee.userId, priority: 'high' } });
    expect(res.status).toBe(201);
  });
  it('tasks: an employee cannot create tasks for others', async () => {
    const res = await call(w.a.employee, 'POST', '/records', { module: 'tasks', type: 'task', name: 'Self-made', branchId: w.HQ, data: { projectId: s.project, assigneeUserId: w.a.employee2.userId } });
    expect(res.status).toBe(403);
  });
  it('milestones: a milestone can be recorded on the project', async () => {
    const res = await call(w.a.projectManager, 'POST', '/records', { module: 'milestones', type: 'milestone', name: 'Brand guidelines approved', branchId: w.HQ, data: { projectId: s.project } });
    expect(res.status).toBe(201);
  });
  it('expenses: an employee submits a project expense; a manager approves it', async () => {
    const exp = await call(w.a.employee, 'POST', '/records', { module: 'expenses', type: 'project_expense', name: 'Print proofs', branchId: w.HQ, data: { amount: '45.00', currency: 'USD' } });
    expect(exp.status).toBe(201);
    const approve = await call(w.a.owner, 'PATCH', `/records/expenses/${exp.body.id}`, { status: 'APPROVED' });
    expect(approve.status).toBe(200);
  });
  it('completion: an authorized user can complete the project', async () => {
    const res = await call(w.a.projectManager, 'PATCH', `/records/projects/${s.project}`, { status: 'COMPLETED' });
    expect(res.status).toBe(200);
  });
});

describe.sequential('Procurement: Supplier → Purchase request → Purchase order → Receiving → Inventory', () => {
  const s: Record<string, string> = {};
  it('purchasing officer registers a supplier', async () => {
    const res = await call(w.a.purchasing, 'POST', '/records', { module: 'suppliers', type: 'supplier', name: 'Conakry Print Supplies', branchId: w.GN, data: { category: 'Printing materials' } });
    expect(res.status).toBe(201);
    s.supplier = res.body.id;
  });
  it('inventory manager raises a purchase request', async () => {
    const res = await call(w.a.inventory, 'POST', '/records', { module: 'purchase-requests', type: 'purchase_request', name: 'Vinyl restock', branchId: w.GN, data: { supplierId: s.supplier } });
    expect(res.status).toBe(201);
    s.pr = res.body.id;
  });
  it('purchasing officer approves the purchase request', async () => {
    expect((await call(w.a.purchasing, 'PATCH', `/records/purchase-requests/${s.pr}`, { status: 'APPROVED' })).status).toBe(200);
  });
  it('purchasing officer issues a purchase order', async () => {
    const res = await call(w.a.purchasing, 'POST', '/records', { module: 'purchase-orders', type: 'purchase_order', name: 'PO — vinyl 10 rolls', branchId: w.GN, data: { supplierId: s.supplier } });
    expect(res.status).toBe(201);
    s.po = res.body.id;
  });
  it('goods are received against the purchase order (purchase_orders.receive)', async () => {
    expect((await call(w.a.inventory, 'POST', `/records/purchase-orders/${s.po}/receive`, {})).status).toBe(201);
  });
  it('workaround: a stock receipt can reference the purchase order', async () => {
    const item = (await call(w.a.inventory, 'POST', '/inventory/items', { code: `PO-${uid().slice(0, 6)}`, name: 'Vinyl roll', category: 'print', unit: 'm', currency: 'USD', branchId: w.GN })).body.id;
    const res = await call(w.a.inventory, 'POST', `/inventory/items/${item}/movements`, { type: 'PURCHASE_RECEIPT', quantity: 10, idempotencyKey: uid(), referenceType: 'purchase-order', referenceId: s.po });
    expect(res.status).toBe(201);
  });
});
