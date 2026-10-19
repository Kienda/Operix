import { beforeAll, describe, expect, it } from 'vitest';
import { buildWorld, call, createActor, fix, rec, type Actor, type World } from './harness';

/** Assigned/self scopes: belonging to the same organization must not be enough. */
let w: World;
let taskA: string, taskB: string, notificationForA: string, unassignedCustomer: string;
let assignedProject: string, unassignedProject: string;
const ids = (res: { body: { data?: Array<{ id: string }> } }) =>
  (res.body.data ?? []).map((r) => r.id);

beforeAll(async () => {
  w = await buildWorld();
  const pm = w.a.projectManager;
  assignedProject = (
    await rec(pm, 'projects', 'Website Development — Northwind', {
      branchId: w.HQ,
      data: {
        customerId: w.r.customerA,
        serviceType: 'software',
        projectManagerUserId: pm.userId,
        memberUserIds: [w.a.employee.userId],
      },
    })
  ).id;
  unassignedProject = (
    await rec(w.a.owner, 'projects', 'Signage Installation — Northwind', {
      branchId: w.HQ,
      data: { customerId: w.r.customerA, serviceType: 'installation' },
    })
  ).id;
  taskA = (
    await rec(pm, 'tasks', 'Build homepage', {
      branchId: w.HQ,
      data: { projectId: assignedProject, assigneeUserId: w.a.employee.userId },
    })
  ).id;
  taskB = (
    await rec(pm, 'tasks', 'Write copy', {
      branchId: w.HQ,
      data: { projectId: assignedProject, assigneeUserId: w.a.employee2.userId },
    })
  ).id;
  notificationForA = (
    await rec(w.a.owner, 'notifications', 'Your timesheet was approved', {
      branchId: w.HQ,
      data: { recipientUserId: w.a.employee.userId },
    })
  ).id;
  unassignedCustomer = (
    await rec(w.a.owner, 'customers', 'Unassigned HQ prospect', { branchId: w.HQ })
  ).id;
});

describe('Tasks (assigned/self)', () => {
  it('employee A lists only their own task', async () => {
    const list = await call(w.a.employee, 'GET', '/records/tasks');
    expect(ids(list)).toContain(taskA);
    expect(ids(list)).not.toContain(taskB);
  });
  it('employee B cannot open or edit employee A’s task', async () => {
    expect((await call(w.a.employee2, 'GET', `/records/tasks/${taskA}`)).status).toBe(404);
    expect(
      (await call(w.a.employee2, 'PATCH', `/records/tasks/${taskA}`, { name: 'hijacked' })).status,
    ).toBe(404);
  });
  // Pilot decision (docs/pilot/ACCESS_MATRIX.md): a self-scope assignee reports
  // progress through status only; renaming/reassigning stays with the planner.
  it('employee A can progress their own task but cannot rename or reassign it', async () => {
    expect(
      (await call(w.a.employee, 'PATCH', `/records/tasks/${taskA}`, { status: 'IN_PROGRESS' }))
        .status,
    ).toBe(200);
    expect(
      (
        await call(w.a.employee, 'PATCH', `/records/tasks/${taskA}`, {
          name: 'Build homepage (in progress)',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(w.a.employee, 'PATCH', `/records/tasks/${taskA}`, {
          data: { assigneeUserId: w.a.employee2.userId },
        })
      ).status,
    ).toBe(403);
  });
});

describe('Notifications (recipient)', () => {
  it('only the recipient can read a private notification', async () => {
    expect(
      (await call(w.a.employee, 'GET', `/records/notifications/${notificationForA}`)).status,
    ).toBe(200);
    expect(
      (await call(w.a.employee2, 'GET', `/records/notifications/${notificationForA}`)).status,
    ).toBe(404);
    expect(ids(await call(w.a.employee2, 'GET', '/records/notifications'))).not.toContain(
      notificationForA,
    );
  });
});

describe('Employee sensitive data', () => {
  it('a company administrator without employees.view_sensitive does not receive banking/salary fields', async () => {
    const res = await call(w.a.admin, 'GET', `/records/employees/${w.r.employeeProfileA}`);
    expect(res.status).toBe(200);
    expect(res.body.data.bankAccountNumber).toBeUndefined();
    expect(res.body.data.baseSalary).toBeUndefined();
    const list = await call(w.a.admin, 'GET', '/records/employees');
    expect(JSON.stringify(list.body)).not.toContain('QA-FAKE-');
  });
  it('the HR manager (holds employees.view_sensitive) receives them', async () => {
    const res = await call(w.a.hr, 'GET', `/records/employees/${w.r.employeeProfileA}`);
    expect(res.body.data.bankAccountNumber).toBe('QA-FAKE-0001');
  });
  it('an administrator cannot write sensitive employee fields', async () => {
    const res = await call(w.a.admin, 'PATCH', `/records/employees/${w.r.employeeProfileA}`, {
      data: { bankAccountNumber: 'QA-FAKE-OVERWRITE' },
    });
    expect(res.status).toBe(403);
  });
  it('global search does not leak sensitive employee data', async () => {
    const res = await call(w.a.admin, 'GET', '/workspace/search?q=Aminata');
    expect(JSON.stringify(res.body)).not.toContain('QA-FAKE-');
  });
});

describe('Assigned commercial scope', () => {
  it('a sales representative sees assigned customers, not every HQ customer', async () => {
    const list = await call(w.a.sales, 'GET', '/records/customers?limit=100');
    expect(ids(list)).toContain(w.r.customerA);
    expect(ids(list)).not.toContain(unassignedCustomer);
  });
  it('a project manager holding projects.view_all sees every project in their branch', async () => {
    // Catalog: projects.view_all = "View every project, not only assigned ones".
    const list = await call(w.a.projectManager, 'GET', '/records/projects?limit=100');
    expect(ids(list)).toContain(assignedProject);
    expect(ids(list)).toContain(unassignedProject);
  });
  it.fails(
    'KNOWN GAP (employee roles have no projects.view; project visibility for task members is an open GHT decision): an employee who is a project member can see the project they work on',
    async () => {
      // Employee role has tasks.view but not projects.view — record the capability gap.
      const res = await call(w.a.employee, 'GET', `/records/projects/${assignedProject}`);
      expect(res.status).toBe(200);
    },
  );
});

describe('Attendance (self)', () => {
  let guard2: Actor;
  it('a user cannot check out another user’s shift and only sees their own history', async () => {
    const shift = await call(w.a.employee, 'POST', '/attendance/check-in', fix(10));
    expect(shift.status).toBe(201);
    expect(
      (await call(w.a.employee2, 'POST', `/attendance/${shift.body.id}/check-out`, fix(10))).status,
    ).toBe(400);
    const mine = await call(w.a.employee2, 'GET', '/attendance/mine');
    expect(mine.body.map((r: { id: string }) => r.id)).not.toContain(shift.body.id);
    expect((await call(w.a.employee, 'GET', '/attendance')).status).toBe(403);
  });
  it('a guard sees only incidents they reported; the supervisor sees the branch', async () => {
    guard2 = await createActor(w.ght, 'security_guard', { alias: 'guard2', branches: ['GN'] });
    const incident = await rec(w.a.guard, 'incidents', 'Broken perimeter light', {
      branchId: w.GN,
      data: { severity: 'low' },
    });
    expect((await call(guard2, 'GET', `/records/incidents/${incident.id}`)).status).toBe(404);
    expect((await call(w.a.supervisor, 'GET', `/records/incidents/${incident.id}`)).status).toBe(
      200,
    );
  });
});
