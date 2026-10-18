import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildWorld,
  call,
  createActor,
  fix,
  writeEvidence,
  type Actor,
  type World,
} from './harness';

/** Employee/guard attendance and security operations (GN site with a geofence). */
let w: World;
beforeAll(async () => {
  w = await buildWorld();
  const fence = await call(w.a.supervisor, 'POST', '/records', {
    module: 'geofences',
    type: 'geofence',
    name: 'Kaloum client site',
    branchId: w.GN,
    data: { latitude: 9.5092, longitude: -13.7122, radiusMeters: 150 },
  });
  if (fence.status !== 201) throw new Error(JSON.stringify(fence.body));
});

describe.sequential('Attendance: check-in → check-out → supervisor review', () => {
  let shift: string;
  it('normal shift: inside the geofence is ACTIVE, checkout completes it', async () => {
    const res = await call(w.a.guard, 'POST', '/attendance/check-in', fix(10));
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.data.checkIn.geofenceResult).toBe('inside');
    shift = res.body.id;
  });
  it('duplicate check-in is rejected', async () => {
    expect((await call(w.a.guard, 'POST', '/attendance/check-in', fix(10))).status).toBe(400);
  });
  it('another user cannot check out this shift', async () => {
    expect(
      (await call(w.a.employee, 'POST', `/attendance/${shift}/check-out`, fix(10))).status,
    ).toBe(400);
  });
  it('checkout completes the shift and records duration; repeated checkout is rejected', async () => {
    const out = await call(w.a.guard, 'POST', `/attendance/${shift}/check-out`, fix(10));
    expect(out.status).toBe(201);
    expect(out.body.status).toBe('COMPLETED');
    expect(typeof out.body.data.durationMinutes).toBe('number');
    expect((await call(w.a.guard, 'POST', `/attendance/${shift}/check-out`, fix(10))).status).toBe(
      400,
    );
  });
  it('outside the geofence becomes PENDING for review', async () => {
    const res = await call(w.a.guard, 'POST', '/attendance/check-in', fix(10, 0.05));
    expect(res.body.status).toBe('PENDING');
    expect(res.body.data.flagReason).toMatch(/Outside/);
    shift = res.body.id;
  });
  it('a pending shift cannot be checked out twice (ATT-01)', async () => {
    expect((await call(w.a.guard, 'POST', `/attendance/${shift}/check-out`, fix(10))).status).toBe(
      201,
    );
    expect((await call(w.a.guard, 'POST', `/attendance/${shift}/check-out`, fix(10))).status).toBe(
      400,
    );
  });
  it('a checked-out shift awaiting review does not block the next check-in (ATT-01)', async () => {
    const next = await call(w.a.guard, 'POST', '/attendance/check-in', fix(10));
    expect(next.status).toBe(201);
    if (next.status === 201)
      await call(w.a.guard, 'POST', `/attendance/${next.body.id}/check-out`, fix(10));
  });
  it('employees cannot approve; the supervisor of the branch can', async () => {
    expect((await call(w.a.employee, 'POST', `/attendance/${shift}/approve`)).status).toBe(403);
    const ok = await call(w.a.supervisor, 'POST', `/attendance/${shift}/approve`);
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('COMPLETED');
    expect(ok.body.data.approvedBy).toBe(w.a.supervisor.userId);
  });
  it('the employee list endpoint is restricted; self-history is available', async () => {
    expect((await call(w.a.guard, 'GET', '/attendance')).status).toBe(403);
    const mine = await call(w.a.guard, 'GET', '/attendance/mine');
    expect(mine.status).toBe(200);
    expect(mine.body.every((r: { createdBy: string }) => r.createdBy === w.a.guard.userId)).toBe(
      true,
    );
  });
  it('records whether a supervisor can approve their own flagged shift (policy decision pending)', async () => {
    const own = await call(w.a.supervisor, 'POST', '/attendance/check-in', fix(500));
    expect(own.body.status).toBe('PENDING');
    const self = await call(w.a.supervisor, 'POST', `/attendance/${own.body.id}/approve`);
    writeEvidence('attendance-self-approval', {
      status: self.status,
      resultingStatus: self.body?.status,
    });
    expect([201, 403]).toContain(self.status);
  });
});

describe('Security operations: site → patrol → incident → supervisor review', () => {
  let guard2: Actor;
  beforeAll(async () => {
    guard2 = await createActor(w.ght, 'security_guard', { alias: 'guard2sec', branches: ['GN'] });
  });
  it('the supervisor configures a patrol route and checkpoint; a guard cannot', async () => {
    expect(
      (
        await call(w.a.supervisor, 'POST', '/records', {
          module: 'patrols',
          type: 'route',
          name: 'Night perimeter',
          branchId: w.GN,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await call(w.a.supervisor, 'POST', '/records', {
          module: 'checkpoints',
          type: 'checkpoint',
          name: 'Gate A',
          branchId: w.GN,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await call(w.a.guard, 'POST', '/records', {
          module: 'patrols',
          type: 'route',
          name: 'Guard route',
          branchId: w.GN,
        })
      ).status,
    ).toBe(403);
    expect((await call(w.a.guard, 'GET', '/records/patrols')).status).toBe(200);
  });
  it('a guard reports an incident and registers a visitor', async () => {
    const inc = await call(w.a.guard, 'POST', '/records', {
      module: 'incidents',
      type: 'incident',
      name: 'Unauthorized vehicle at Gate A',
      branchId: w.GN,
      data: { severity: 'medium' },
    });
    expect(inc.status).toBe(201);
    expect(
      (
        await call(w.a.guard, 'POST', '/records', {
          module: 'visitors',
          type: 'visitor',
          name: 'Delivery driver',
          branchId: w.GN,
        })
      ).status,
    ).toBe(201);
    // guard cannot resolve; supervisor can review
    expect(
      (await call(w.a.guard, 'PATCH', `/records/incidents/${inc.body.id}`, { status: 'COMPLETED' }))
        .status,
    ).toBe(403);
    const review = await call(w.a.supervisor, 'PATCH', `/records/incidents/${inc.body.id}`, {
      status: 'COMPLETED',
      data: { reviewNotes: 'Vehicle identified; logged' },
    });
    expect(review.status).toBe(200);
    expect((await call(guard2, 'GET', `/records/incidents/${inc.body.id}`)).status).toBe(404);
  });
  it('a guard can be assigned to a site and shift (assignment model)', async () => {
    const res = await call(w.a.supervisor, 'POST', '/records', {
      module: 'guard-assignments',
      type: 'assignment',
      name: 'Guard @ Kaloum',
      branchId: w.GN,
      data: { userId: w.a.guard.userId },
    });
    expect(res.status).toBe(201);
  });
  it('a guard can record a checkpoint scan during a patrol', async () => {
    expect(
      (await call(w.a.guard, 'POST', '/security/patrols/scan', { checkpoint: 'Gate A' })).status,
    ).toBe(201);
  });
});
