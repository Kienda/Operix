import { beforeAll, describe, expect, it } from 'vitest';
import { getSystemRole } from '@operix/permissions';
import { buildWorld, call, uid, writeEvidence, type Actor, type World } from './harness';

/**
 * Capability matrix: every representative role × every API operation.
 *
 * Expectations are computed from the permission CATALOG (packages/permissions)
 * and the route contract below — not from what the server returned — so this
 * proves the runtime enforces what the catalog declares. Record/branch/
 * assignment scope is tested separately in the scope specs.
 */

const VIEW: Record<string, string[]> = {
  customers: ['customers.view'],
  leads: ['leads.view'],
  services: ['services.view'],
  quotations: ['quotations.view'],
  contracts: ['contracts.view'],
  projects: ['projects.view'],
  tasks: ['tasks.view'],
  'work-orders': ['work_orders.view'],
  expenses: ['expenses.view'],
  suppliers: ['suppliers.view'],
  'purchase-requests': ['purchase_requests.view'],
  'purchase-orders': ['purchase_orders.view'],
  'production-jobs': ['production.view'],
  employees: ['employees.view'],
  'leave-requests': ['leave.view'],
  'payroll-runs': ['payroll.view'],
  geofences: ['attendance.view'],
  patrols: ['security.patrols.view'],
  checkpoints: ['security.patrols.view'],
  incidents: ['security.incidents.view'],
  visitors: ['security.visitors.view'],
  assets: ['assets.view'],
  documents: ['documents.view'],
  notifications: ['notifications.view'],
  reports: ['reports.view'],
};
const CREATE: Record<string, string[]> = {
  customers: ['customers.create'],
  leads: ['leads.create'],
  services: ['services.manage'],
  quotations: ['quotations.create'],
  contracts: ['contracts.create'],
  projects: ['projects.create'],
  tasks: ['tasks.create'],
  'work-orders': ['work_orders.create'],
  expenses: ['expenses.create'],
  suppliers: ['suppliers.manage'],
  'purchase-requests': ['purchase_requests.create'],
  'purchase-orders': ['purchase_orders.create'],
  'production-jobs': ['production.manage_queue'],
  employees: ['employees.create'],
  'leave-requests': ['leave.request'],
  'payroll-runs': ['payroll.process'],
  geofences: ['security.geofences.manage'],
  patrols: ['security.patrols.manage'],
  checkpoints: ['security.patrols.manage'],
  incidents: ['security.incidents.create'],
  visitors: ['security.visitors.register'],
  assets: ['assets.manage'],
  documents: ['documents.upload'],
  notifications: ['notifications.send_manual'],
  reports: ['reports.build'],
};

type Probe = {
  id: string;
  method: string;
  path: (a: Actor) => string;
  body?: (a: Actor) => unknown;
  any?: string[];
  all?: string[];
  /** Status when the catalog grants the capability. */
  ok: number;
  /** Extra scope precondition: when false the role is expected to be denied even with the permission. */
  scoped?: (a: Actor, role: string) => boolean;
};

const ROLES: Array<[keyof World['a'], string]> = [
  ['owner', 'company_owner'],
  ['admin', 'company_admin'],
  ['branchManager', 'branch_manager'],
  ['finance', 'finance_manager'],
  ['accountant', 'accountant'],
  ['salesManager', 'sales_manager'],
  ['sales', 'sales_representative'],
  ['projectManager', 'project_manager'],
  ['inventory', 'inventory_manager'],
  ['purchasing', 'purchasing_officer'],
  ['hr', 'hr_manager'],
  ['supervisor', 'security_supervisor'],
  ['guard', 'security_guard'],
  ['employee', 'employee'],
  ['viewer', 'readonly_user'],
  ['customer', 'customer'],
  ['platform', 'platform_super_admin'],
];

let w: World;
beforeAll(async () => {
  w = await buildWorld();
});

function probes(): Probe[] {
  const branchOf = (a: Actor) => a.branchIds[0];
  const customerFor = (a: Actor) => (a.branchIds[0] === w.GN ? w.r.customerB : w.r.customerA);
  const txBranch = (a: Actor) => a.branchIds[0] ?? w.HQ;
  const list: Probe[] = [];
  for (const [module, any] of Object.entries(VIEW))
    list.push({
      id: `GET /records/${module}`,
      method: 'GET',
      path: () => `/records/${module}`,
      any,
      ok: 200,
    });
  const projectFor = (a: Actor) => (a.branchIds[0] === w.GN ? w.r.projectGN : w.r.projectHQ);
  for (const [module, any] of Object.entries(CREATE))
    list.push({
      id: `POST /records (${module})`,
      method: 'POST',
      path: () => '/records',
      body: (a) => ({
        module,
        type: 'qa',
        name: `Matrix ${module} ${uid().slice(0, 6)}`,
        ...(branchOf(a) ? { branchId: branchOf(a) } : {}),
        data:
          module === 'notifications'
            ? { recipientUserId: a.userId }
            : module === 'tasks'
              ? { projectId: projectFor(a) }
              : {},
      }),
      any,
      // Quotations are command-only: the generic store rejects them even for permitted callers.
      ok: module === 'quotations' ? 400 : 201,
    });
  list.push(
    {
      id: 'POST /quotations',
      method: 'POST',
      path: () => '/quotations',
      all: ['quotations.create'],
      ok: 201,
      body: (a) => ({
        customerId: customerFor(a),
        title: 'Matrix quotation',
        currency: 'USD',
        taxRate: '0',
        items: [{ description: 'Probe line', quantity: '1', unitPrice: '10.00' }],
      }),
    },
    {
      id: 'POST /quotations/:id/accept (unknown)',
      method: 'POST',
      path: () => `/quotations/${uid()}/accept`,
      body: () => ({}),
      all: ['quotations.approve'],
      ok: 404,
    },
    {
      id: 'POST /projects/:id/complete (unknown)',
      method: 'POST',
      path: () => `/projects/${uid()}/complete`,
      all: ['projects.change_status'],
      ok: 404,
    },
    {
      id: 'GET /organization/assignable-roles',
      method: 'GET',
      path: () => '/organization/assignable-roles',
      all: ['users.manage'],
      ok: 200,
    },
  );
  list.push(
    {
      id: 'GET /inventory/items',
      method: 'GET',
      path: () => '/inventory/items',
      all: ['inventory.view'],
      ok: 200,
    },
    {
      id: 'POST /inventory/items',
      method: 'POST',
      path: () => '/inventory/items',
      all: ['inventory.receive'],
      ok: 201,
      body: (a) => ({
        code: `QA-${uid().slice(0, 8)}`,
        name: 'Matrix item',
        category: 'qa',
        unit: 'pcs',
        currency: 'USD',
        ...(branchOf(a) ? { branchId: branchOf(a) } : {}),
      }),
    },
    {
      id: 'POST /inventory/items/:id/movements (receipt, unknown item)',
      method: 'POST',
      path: () => `/inventory/items/${uid()}/movements`,
      all: ['inventory.receive'],
      ok: 404,
      body: () => ({ type: 'PURCHASE_RECEIPT', quantity: 1, idempotencyKey: uid() }),
    },
    {
      id: 'POST /finance/invoices',
      method: 'POST',
      path: () => '/finance/invoices',
      all: ['invoices.create'],
      ok: 201,
      body: (a) => ({
        customerId: customerFor(a),
        branchId: txBranch(a),
        number: `INV-${uid().slice(0, 8)}`,
        currency: 'USD',
        subtotal: 10,
        tax: 0,
      }),
    },
    {
      id: 'POST /finance/payments (unallocated)',
      method: 'POST',
      path: () => '/finance/payments',
      all: ['payments.record'],
      ok: 201,
      body: (a) => ({
        customerId: customerFor(a),
        branchId: txBranch(a),
        number: `PAY-${uid().slice(0, 8)}`,
        amount: 5,
        currency: 'USD',
        method: 'CASH',
        receivedAt: new Date().toISOString(),
        allocations: [],
      }),
    },
    {
      id: 'POST /finance/payments/:id/verify (unknown)',
      method: 'POST',
      path: () => `/finance/payments/${uid()}/verify`,
      all: ['payments.verify'],
      ok: 404,
    },
    {
      id: 'GET /finance/summary',
      method: 'GET',
      path: () => '/finance/summary',
      all: ['reports.view', 'invoices.view', 'payments.view', 'balances.view'],
      ok: 200,
    },
    {
      id: 'POST /projects/:id/start (unknown)',
      method: 'POST',
      path: () => `/projects/${uid()}/start`,
      body: () => ({}),
      all: ['projects.change_status'],
      ok: 404,
    },
    {
      id: 'GET /attendance',
      method: 'GET',
      path: () => '/attendance',
      all: ['attendance.view'],
      ok: 200,
    },
    {
      id: 'GET /attendance/pending',
      method: 'GET',
      path: () => '/attendance/pending',
      all: ['attendance.view'],
      ok: 200,
    },
    {
      id: 'GET /attendance/mine',
      method: 'GET',
      path: () => '/attendance/mine',
      all: ['attendance.view_own'],
      ok: 200,
    },
    {
      id: 'POST /attendance/check-in',
      method: 'POST',
      path: () => '/attendance/check-in',
      all: ['attendance.check_in'],
      ok: 201,
      body: () => ({ latitude: 9.5, longitude: -13.7, accuracyMeters: 10 }),
    },
    {
      id: 'POST /attendance/:id/approve (unknown)',
      method: 'POST',
      path: () => `/attendance/${uid()}/approve`,
      all: ['attendance.approve'],
      ok: 400,
    },
    { id: 'GET /organization', method: 'GET', path: () => '/organization', all: [], ok: 200 },
    {
      id: 'PATCH /organization (no-op)',
      method: 'PATCH',
      path: () => '/organization',
      body: () => ({}),
      all: ['settings.manage'],
      ok: 200,
    },
    {
      id: 'GET /organization/users',
      method: 'GET',
      path: () => '/organization/users',
      all: ['users.manage'],
      ok: 200,
    },
    {
      id: 'GET /organization/roles',
      method: 'GET',
      path: () => '/organization/roles',
      all: ['roles.manage'],
      ok: 200,
    },
    {
      id: 'GET /organization/audit',
      method: 'GET',
      path: () => '/organization/audit',
      all: ['audit.view'],
      ok: 200,
    },
    {
      id: 'GET /organization/invitations',
      method: 'GET',
      path: () => '/organization/invitations',
      all: ['users.manage'],
      ok: 200,
    },
    {
      id: 'GET /workspace/dashboard',
      method: 'GET',
      path: () => '/workspace/dashboard',
      all: [],
      ok: 200,
    },
    {
      id: 'GET /workspace/search',
      method: 'GET',
      path: () => '/workspace/search?q=QA',
      all: [],
      ok: 200,
    },
    {
      id: 'GET /platform/plans',
      method: 'GET',
      path: () => '/platform/plans',
      all: ['platform.plans.manage'],
      ok: 200,
    },
    {
      id: 'GET /platform/subscriptions',
      method: 'GET',
      path: () => '/platform/subscriptions',
      all: ['platform.subscriptions.manage'],
      ok: 200,
    },
  );
  return list;
}

/** Catalog permissions that can be effective in a tenant (the portal module is never enabled by the seed). */
function catalogEffective(roleKey: string) {
  return new Set(
    (getSystemRole(roleKey)?.permissions ?? []).filter((p) => !p.startsWith('portal.')),
  );
}

describe('Role capability matrix (catalog vs runtime)', () => {
  const evidence: Record<string, Record<string, { expected: number; actual: number }>> = {};

  it.each(ROLES)('%s (%s): login returns exactly the catalog capability set', (alias, roleKey) => {
    const actor = w.a[alias];
    expect([...actor.permissions].sort()).toEqual([...catalogEffective(roleKey)].sort());
  });

  it.each(ROLES)(
    '%s (%s): every operation is allowed or denied exactly as the catalog declares',
    async (alias, roleKey) => {
      const actor = w.a[alias];
      const granted = catalogEffective(roleKey);
      const mismatches: string[] = [];
      evidence[roleKey] = {};
      for (const probe of probes()) {
        const allowed =
          (probe.any ? probe.any.some((p) => granted.has(p)) : true) &&
          (probe.all ? probe.all.every((p) => granted.has(p)) : true);
        const expected = allowed ? probe.ok : 403;
        const res = await call(actor, probe.method, probe.path(actor), probe.body?.(actor));
        evidence[roleKey][probe.id] = { expected, actual: res.status };
        if (res.status !== expected)
          mismatches.push(
            `${probe.id}: expected ${expected}, got ${res.status} ${JSON.stringify(res.body?.error?.message ?? '')}`,
          );
      }
      writeEvidence('role-matrix', evidence);
      expect(mismatches).toEqual([]);
    },
  );
});
