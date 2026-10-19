import { beforeAll, describe, expect, it } from 'vitest';
import { buildWorld, call, db, invoice, paymentBody, rec, uid, type World } from './harness';

/**
 * Primary commercial chain and project/procurement workflows, step by step.
 *
 * Each step asserts the intended behaviour; a failing step marks where the
 * workflow currently stops. Later steps continue from workarounds so every
 * gap is reported, not just the first one.
 */
let w: World;
beforeAll(async () => {
  w = await buildWorld();
});

describe.sequential(
  'Commercial: Lead → Customer → Quote → Contract → Project → Invoice → Payment → Receipt',
  () => {
    const s: Record<string, string> = {};

    it('1. sales rep creates a lead (stage new)', async () => {
      const lead = await call(w.a.sales, 'POST', '/records', {
        module: 'leads',
        type: 'lead',
        name: 'Conakry Port Authority — website',
        branchId: w.HQ,
        data: {
          stage: 'new',
          source: 'referral',
          assignedToUserId: w.a.sales.userId,
          estimatedValue: '12000.00',
          currency: 'USD',
        },
      });
      expect(lead.status).toBe(201);
      s.lead = lead.body.id;
    });

    it('2. sales rep qualifies the lead', async () => {
      const res = await call(w.a.sales, 'PATCH', `/records/leads/${s.lead}`, {
        status: 'ACTIVE',
        data: { stage: 'qualified' },
      });
      expect(res.status).toBe(200);
      expect(res.body.data.stage).toBe('qualified');
    });

    it('3. the qualified lead converts into a customer (leads.convert)', async () => {
      const res = await call(w.a.sales, 'POST', `/records/leads/${s.lead}/convert`, {});
      expect(res.status).toBe(201);
      s.customer = res.body.id;
    });

    it('3b. conversion retries return the same customer', async () => {
      const res = await call(w.a.sales, 'POST', `/records/leads/${s.lead}/convert`, {});
      expect(res.status).toBe(201);
      expect(res.body.id).toBe(s.customer);
    });

    it('4. sales rep creates a quotation for the customer and sends it', async () => {
      const res = await call(w.a.sales, 'POST', '/quotations', {
        customerId: s.customer,
        title: 'QT — Website Development',
        currency: 'USD',
        taxRate: '0',
        items: [{ description: 'Website development', quantity: '1', unitPrice: '12000.00' }],
      });
      expect(res.status).toBe(201);
      expect(res.body.data.total).toBe('12000');
      s.quote = res.body.id;
      expect((await call(w.a.sales, 'POST', `/quotations/${s.quote}/send`)).status).toBe(201);
    });

    it('5a. a sales rep (no quotations.approve) cannot approve the quotation', async () => {
      expect((await call(w.a.sales, 'POST', `/quotations/${s.quote}/accept`, {})).status).toBe(403);
      const res = await call(w.a.sales, 'PATCH', `/records/quotations/${s.quote}`, {
        status: 'APPROVED',
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('5b. a sales manager (quotations.approve) can approve the quotation', async () => {
      const res = await call(w.a.salesManager, 'POST', `/quotations/${s.quote}/accept`, {});
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('APPROVED');
    });

    it('6. an unassigned project manager cannot create a project for this customer', async () => {
      const res = await call(w.a.projectManager, 'POST', '/records', {
        module: 'projects',
        type: 'client_project',
        name: 'Website Development — Port Authority',
        branchId: w.HQ,
        data: {
          customerId: s.customer,
          quotationId: s.quote,
          serviceType: 'software',
          contractRequirement: 'before_work_starts',
          projectManagerUserId: w.a.projectManager.userId,
        },
      });
      expect(res.status).toBe(400);
    });

    it('6b. workaround: the sales rep assigns the project manager on the customer, then the project is created', async () => {
      const assign = await call(w.a.sales, 'PATCH', `/records/customers/${s.customer}`, {
        data: { projectManagerUserId: w.a.projectManager.userId },
      });
      expect(assign.status).toBe(200);
      const res = await call(w.a.projectManager, 'POST', '/records', {
        module: 'projects',
        type: 'client_project',
        name: 'Website Development — Port Authority',
        branchId: w.HQ,
        data: {
          customerId: s.customer,
          serviceType: 'software',
          contractRequirement: 'before_work_starts',
          projectManagerUserId: w.a.projectManager.userId,
        },
      });
      expect(res.status).toBe(201);
      s.project = res.body.id;
    });

    it('6c. linking a quotation requires visibility of both records', async () => {
      const res = await call(w.a.projectManager, 'PATCH', `/records/projects/${s.project}`, {
        data: { quotationId: s.quote },
      });
      expect(res.status).toBe(400);
      expect(
        (
          await call(w.a.owner, 'PATCH', `/records/projects/${s.project}`, {
            data: { quotationId: s.quote },
          })
        ).status,
      ).toBe(200);
    });

    it('7a. an explicitly assigned sales representative can link a contract to the project', async () => {
      expect(
        (
          await call(w.a.owner, 'PATCH', `/records/projects/${s.project}`, {
            data: { memberUserIds: [w.a.sales.userId] },
          })
        ).status,
      ).toBe(200);
      const res = await call(w.a.sales, 'POST', '/records', {
        module: 'contracts',
        type: 'service_contract',
        name: 'Website delivery agreement',
        branchId: w.HQ,
        data: {
          customerId: s.customer,
          projectId: s.project,
          value: '12000.00',
          currency: 'USD',
        },
      });
      expect(res.status).toBe(201);
      s.contract = res.body.id;
    });

    it('7b. contract approval and signed attachment use dedicated commands; generic completion is blocked', async () => {
      const res = await call(w.a.owner, 'PATCH', `/records/contracts/${s.contract}`, {
        status: 'COMPLETED',
      });
      expect(res.status).toBe(400);
      expect((await call(w.a.owner, 'POST', `/contracts/${s.contract}/approve`)).status).toBe(201);
      const document = await rec(w.a.owner, 'documents', 'Signed contract', {
        branchId: w.HQ,
        data: { contractId: s.contract },
      });
      expect(
        (
          await call(w.a.owner, 'POST', `/contracts/${s.contract}/upload-signed`, {
            documentId: document.id,
          })
        ).status,
      ).toBe(201);
    });

    it('8a. the project cannot start without an executed contract', async () => {
      expect(
        (await call(w.a.projectManager, 'POST', `/projects/${s.project}/start`, {})).status,
      ).toBe(400);
    });

    it('8b. generic PATCH cannot bypass the start gate, change the gate, or archive (FLOW-01)', async () => {
      expect(
        (
          await call(w.a.owner, 'PATCH', `/records/projects/${s.project}`, {
            status: 'IN_PROGRESS',
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await call(w.a.owner, 'PATCH', `/records/projects/${s.project}`, {
            data: { contractRequirement: 'not_required' },
          })
        ).status,
      ).toBe(400);
      expect(
        (await call(w.a.owner, 'PATCH', `/records/customers/${s.customer}`, { status: 'ARCHIVED' }))
          .status,
      ).toBe(400);
      const project = await db().businessRecord.findUniqueOrThrow({ where: { id: s.project } });
      expect(project.status).toBe('DRAFT');
    });

    it('8c. an override needs contracts.override_gate and a reason, and is audited', async () => {
      const override = await rec(w.a.owner, 'projects', 'Separate override project', {
        branchId: w.HQ,
        data: { customerId: s.customer, contractRequirement: 'before_work_starts' },
      });
      expect(
        (
          await call(w.a.admin, 'POST', `/projects/${override.id}/start`, {
            overrideReason: 'Customer signed on paper, scan pending',
          })
        ).status,
      ).toBe(403);
      const ok = await call(w.a.owner, 'POST', `/projects/${override.id}/start`, {
        overrideReason: 'Customer signed on paper, scan pending',
      });
      expect(ok.status).toBe(201);
      expect(ok.body.status).toBe('IN_PROGRESS');
      expect(
        await db().auditLog.count({
          where: { action: 'CONTRACT_GATE_OVERRIDE', resourceId: override.id },
        }),
      ).toBe(1);
    });

    it('8d. a countersigned contract opens the actual project gate without an override', async () => {
      const executed = await call(w.a.owner, 'POST', `/contracts/${s.contract}/countersign`);
      expect(executed.status).toBe(201);
      expect(executed.body.status).toBe('COMPLETED');
      expect(
        (await call(w.a.projectManager, 'POST', `/projects/${s.project}/start`, {})).status,
      ).toBe(201);
      expect(
        await db().auditLog.count({
          where: { action: 'CONTRACT_GATE_OVERRIDE', resourceId: s.project },
        }),
      ).toBe(0);
    });

    it('9. invoice → payment → verification settles the invoice', async () => {
      const inv = await invoice(w.a.accountant, s.customer, w.HQ, 12000);
      const pay = await call(
        w.a.accountant,
        'POST',
        '/finance/payments',
        paymentBody(s.customer, w.HQ, 12000, [{ invoiceId: inv.id, amount: 12000 }]),
      );
      expect(pay.status).toBe(201);
      const v = await call(w.a.finance, 'POST', `/finance/payments/${pay.body.id}/verify`);
      expect(v.status).toBe(201);
      expect((await db().invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe('PAID');
      s.payment = pay.body.id;
    });

    it('10. a receipt is issued for the verified payment', async () => {
      expect(
        (await call(w.a.accountant, 'GET', `/finance/payments/${s.payment}/receipt`)).status,
      ).toBe(200);
    });

    it('rejects an unknown status with a sanitized 400, not a 500 (API-01)', async () => {
      const res = await call(w.a.owner, 'PATCH', `/records/customers/${s.customer}`, {
        status: 'WON',
      });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).not.toMatch(/prisma|BusinessRecord/i);
    });
  },
);

describe.sequential(
  'Project delivery: Team → Tasks → Milestones → Materials → Expenses → Completion',
  () => {
    const s: Record<string, string> = {};
    it('setup: started project without a contract requirement', async () => {
      s.project = (
        await rec(w.a.projectManager, 'projects', 'Branding Project — Northwind', {
          branchId: w.HQ,
          data: {
            customerId: w.r.customerA,
            serviceType: 'marketing',
            projectManagerUserId: w.a.projectManager.userId,
          },
        })
      ).id;
      expect(
        (await call(w.a.projectManager, 'POST', `/projects/${s.project}/start`, {})).status,
      ).toBe(201);
    });
    it('team: the project manager adds team members', async () => {
      const res = await call(w.a.projectManager, 'PATCH', `/records/projects/${s.project}`, {
        data: { memberUserIds: [w.a.employee.userId] },
      });
      expect(res.status).toBe(200);
    });
    it('tasks: the project manager assigns a task to a team member', async () => {
      const res = await call(w.a.projectManager, 'POST', '/records', {
        module: 'tasks',
        type: 'task',
        name: 'Logo concepts',
        branchId: w.HQ,
        data: { projectId: s.project, assigneeUserId: w.a.employee.userId, priority: 'high' },
      });
      expect(res.status).toBe(201);
    });
    it('tasks: an employee cannot create tasks for others', async () => {
      const res = await call(w.a.employee, 'POST', '/records', {
        module: 'tasks',
        type: 'task',
        name: 'Self-made',
        branchId: w.HQ,
        data: { projectId: s.project, assigneeUserId: w.a.employee2.userId },
      });
      expect(res.status).toBe(403);
    });
    it('milestones: a milestone can be recorded on the project', async () => {
      const res = await call(w.a.projectManager, 'POST', '/records', {
        module: 'milestones',
        type: 'milestone',
        name: 'Brand guidelines approved',
        branchId: w.HQ,
        data: { projectId: s.project },
      });
      expect(res.status).toBe(201);
    });
    it('expenses: an employee submits an expense; only the approval command changes its state', async () => {
      const exp = await call(w.a.employee, 'POST', '/records', {
        module: 'expenses',
        type: 'project_expense',
        name: 'Print proofs',
        branchId: w.HQ,
        data: { amount: '45.00', currency: 'USD' },
      });
      expect(exp.status).toBe(201);
      const generic = await call(w.a.owner, 'PATCH', `/records/expenses/${exp.body.id}`, {
        status: 'APPROVED',
      });
      expect(generic.status).toBe(400);
      expect((await call(w.a.employee, 'POST', `/expenses/${exp.body.id}/approve`)).status).toBe(
        403,
      );
      const approve = await call(w.a.owner, 'POST', `/expenses/${exp.body.id}/approve`);
      expect(approve.status).toBe(201);
      expect(approve.body.status).toBe('APPROVED');
    });
    it('completion: an authorized user completes the project through the domain command', async () => {
      expect(
        (
          await call(w.a.projectManager, 'PATCH', `/records/projects/${s.project}`, {
            status: 'COMPLETED',
          })
        ).status,
      ).toBe(400);
      const res = await call(w.a.projectManager, 'POST', `/projects/${s.project}/complete`);
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('COMPLETED');
    });
  },
);

describe.sequential(
  'Procurement: Supplier → Purchase request → Purchase order → Receiving → Inventory',
  () => {
    const s: Record<string, string> = {};
    it('purchasing officer registers a supplier', async () => {
      const res = await call(w.a.purchasing, 'POST', '/records', {
        module: 'suppliers',
        type: 'supplier',
        name: 'Conakry Print Supplies',
        branchId: w.GN,
        data: { category: 'Printing materials' },
      });
      expect(res.status).toBe(201);
      s.supplier = res.body.id;
    });
    it('inventory manager raises a purchase request', async () => {
      const res = await call(w.a.inventory, 'POST', '/records', {
        module: 'purchase-requests',
        type: 'purchase_request',
        name: 'Vinyl restock',
        branchId: w.GN,
        data: { supplierId: s.supplier },
      });
      expect(res.status).toBe(201);
      s.pr = res.body.id;
    });
    it('purchasing officer approves the purchase request through the dedicated command', async () => {
      expect(
        (await call(w.a.purchasing, 'POST', `/purchase-requests/${s.pr}/approve`)).status,
      ).toBe(201);
    });
    it('purchasing officer issues a purchase order', async () => {
      const item = await call(w.a.inventory, 'POST', '/inventory/items', {
        code: `PO-${uid().slice(0, 6)}`,
        name: 'Vinyl roll',
        category: 'print',
        unit: 'm',
        currency: 'USD',
        branchId: w.GN,
      });
      expect(item.status).toBe(201);
      s.item = item.body.id;
      const res = await call(w.a.purchasing, 'POST', '/records', {
        module: 'purchase-orders',
        type: 'purchase_order',
        name: 'PO — vinyl 10 rolls',
        branchId: w.GN,
        data: { supplierId: s.supplier, items: [{ itemId: s.item, quantity: '10' }] },
      });
      expect(res.status).toBe(201);
      s.po = res.body.id;
      expect((await call(w.a.purchasing, 'POST', `/purchase-orders/${s.po}/send`)).status).toBe(
        201,
      );
    });
    it('goods receiving atomically posts the planned stock quantities', async () => {
      s.receiptKey = uid();
      expect(
        (
          await call(w.a.inventory, 'POST', `/records/purchase-orders/${s.po}/receive`, {
            idempotencyKey: s.receiptKey,
            items: [{ itemId: s.item, quantity: '10' }],
          })
        ).status,
      ).toBe(201);
    });
    it('receiving retries cannot duplicate stock or bypass the purchase order quantity', async () => {
      const retry = await call(w.a.inventory, 'POST', `/records/purchase-orders/${s.po}/receive`, {
        idempotencyKey: s.receiptKey,
        items: [{ itemId: s.item, quantity: '10' }],
      });
      expect(retry.status).toBe(201);
      expect(
        (await db().inventoryItem.findUniqueOrThrow({ where: { id: s.item } })).quantity.toFixed(),
      ).toBe('10');
      expect(
        (
          await call(w.a.inventory, 'POST', `/records/purchase-orders/${s.po}/receive`, {
            idempotencyKey: s.receiptKey,
            items: [{ itemId: s.item, quantity: '11' }],
          })
        ).status,
      ).toBe(409);
      const res = await call(w.a.inventory, 'POST', `/inventory/items/${s.item}/movements`, {
        type: 'PURCHASE_RECEIPT',
        quantity: 10,
        idempotencyKey: uid(),
        referenceType: 'purchase-order',
        referenceId: s.po,
      });
      expect(res.status).toBe(400);
    });
  },
);
