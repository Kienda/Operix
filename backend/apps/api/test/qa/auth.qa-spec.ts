import { beforeAll, describe, expect, it } from 'vitest';
import { generate } from 'otplib';
import {
  buildWorld,
  call,
  createActor,
  createTenant,
  db,
  login,
  testPassword,
  type World,
} from './harness';

let w: World;
beforeAll(async () => {
  w = await buildWorld();
});

describe('Authentication', () => {
  it('every representative account can sign in and /auth/me resolves its own workspace and role', async () => {
    for (const actor of Object.values(w.a)) {
      const me = await call(actor, 'GET', '/auth/me');
      expect(me.status, actor.alias).toBe(200);
      expect(me.body.organizationId ?? me.body.organization?.id, actor.alias).toBe(actor.orgId);
      expect(me.body.userId ?? me.body.user?.id, actor.alias).toBe(actor.userId);
    }
  });

  it('rejects anonymous access to business endpoints with 401', async () => {
    for (const path of [
      '/records/customers',
      '/finance/summary',
      '/workspace/dashboard',
      '/inventory/items',
      '/attendance/mine',
    ])
      expect((await call(null, 'GET', path)).status, path).toBe(401);
  });

  it('rejects a wrong password and an unknown email identically', async () => {
    const wrong = await login(w.a.owner.email, 'definitely-not-the-password');
    const unknown = await login('nobody@qa.operix.test', 'definitely-not-the-password');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('denies a valid GHT token presented with the Atlas organization header', async () => {
    const res = await call(w.a.owner, 'GET', '/records/customers', undefined, {
      orgId: w.atlas.id,
    });
    expect(res.status).toBe(403);
  });

  it('binds a session to the workspace it was issued for (multi-membership user)', async () => {
    const user = await db().user.findUniqueOrThrow({ where: { id: w.a.employee.userId } });
    const role = await db().role.findFirstOrThrow({
      where: { organizationId: w.atlas.id, name: 'Employee' },
    });
    await db().organizationUser.create({
      data: { organizationId: w.atlas.id, userId: user.id, roleId: role.id, branchIds: [w.AT] },
    });
    const ambiguous = await login(user.email);
    expect(ambiguous.status).toBe(400);
    expect(ambiguous.body.error.code).toBe('WORKSPACE_SELECTION_REQUIRED');
    const ght = await login(user.email, testPassword(), { organizationSlug: w.ght.slug });
    expect(ght.status).toBe(201);
    const crossed = await call(null, 'GET', '/attendance/mine', undefined, {
      token: ght.body.accessToken,
      orgId: w.atlas.id,
    });
    expect(crossed.status).toBe(401);
  });

  it('rotates refresh tokens and rejects the previous refresh token', async () => {
    const actor = await createActor(w.ght, 'readonly_user', { alias: 'refresh', branches: ['HQ'] });
    const first = await call(null, 'POST', '/auth/refresh', { refreshToken: actor.refreshToken });
    expect(first.status).toBe(201);
    expect(first.body.refreshToken).not.toBe(actor.refreshToken);
    expect(
      (await call(null, 'POST', '/auth/refresh', { refreshToken: actor.refreshToken })).status,
    ).toBe(401);
  });

  it('logout revokes the session for subsequent requests', async () => {
    const actor = await createActor(w.ght, 'readonly_user', { alias: 'logout', branches: ['HQ'] });
    expect([200, 201]).toContain((await call(actor, 'POST', '/auth/logout')).status);
    expect((await call(actor, 'GET', '/auth/me')).status).toBe(401);
  });

  it('a suspended user loses access on the next request', async () => {
    const actor = await createActor(w.ght, 'readonly_user', {
      alias: 'suspended',
      branches: ['HQ'],
    });
    await db().user.update({ where: { id: actor.userId }, data: { status: 'SUSPENDED' } });
    expect((await call(actor, 'GET', '/records/customers')).status).toBe(403);
    expect((await login(actor.email)).status).toBe(401);
  });
});

describe('MFA', () => {
  it('requires the password to start enrollment and the current factor to replace an enabled one', async () => {
    const actor = await createActor(w.ght, 'readonly_user', { alias: 'mfa', branches: ['HQ'] });
    expect((await call(actor, 'POST', '/auth/mfa/enroll', {})).status).toBeGreaterThanOrEqual(400);
    const enroll = await call(actor, 'POST', '/auth/mfa/enroll', { password: testPassword() });
    expect(enroll.status).toBe(201);
    const confirm = await call(actor, 'POST', '/auth/mfa/confirm', {
      code: await generate({ secret: enroll.body.secret }),
    });
    expect(confirm.status).toBe(201);

    // AUTH-01: an active session plus password alone must not reset an enabled factor.
    const takeover = await call(actor, 'POST', '/auth/mfa/enroll', { password: testPassword() });
    expect(takeover.status).toBe(401);
    expect((await login(actor.email)).status).toBe(401);
    const withCode = await login(actor.email, testPassword(), {
      mfaCode: await generate({ secret: enroll.body.secret }),
    });
    expect(withCode.status).toBe(201);
  });
});

describe('Subscription lifecycle', () => {
  it('an expired workspace is read-only for business writes but can still sign out (SUB-01)', async () => {
    const tenant = await createTenant('expired', [
      { code: 'EX', name: 'Expired HQ', country: 'US', currency: 'USD', timezone: 'UTC' },
    ]);
    const plan = await db().subscriptionPlan.upsert({
      where: { key: 'qa-plan' },
      update: {},
      create: { key: 'qa-plan', name: 'QA', currency: 'USD', sixMonthPrice: 1200 },
    });
    await db().subscription.create({
      data: {
        organizationId: tenant.id,
        planId: plan.id,
        periodMonths: 6,
        status: 'EXPIRED',
        basePrice: 1200,
        effectivePrice: 1200,
        currency: 'USD',
        endsAt: new Date(Date.now() - 86_400_000),
      },
    });
    const owner = await createActor(tenant, 'company_owner', { alias: 'expiredOwner' });
    expect((await call(owner, 'GET', '/records/customers')).status).toBe(200);
    expect(
      (
        await call(owner, 'POST', '/records', {
          module: 'customers',
          type: 'company',
          name: 'Blocked write',
        })
      ).status,
    ).toBe(403);
    expect([200, 201]).toContain((await call(owner, 'POST', '/auth/logout')).status);
  });
});

describe('Customer identity', () => {
  it.fails(
    'KNOWN GAP (customer portal not implemented): a customer account receives a usable portal capability set after sign-in',
    async () => {
      // The customer role's permissions all belong to the `portal` module.
      expect(w.a.customer.permissions).toContain('portal.projects.view');
    },
  );
});
