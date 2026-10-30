// Real browser + real API/database in the UUID schema created by global setup.
// Never use this fixture builder against staging or a remote database.
import { test, expect } from '@playwright/test';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { state, totp } from './support.mjs';

const env = state();
const requireApi = createRequire(resolve('backend/apps/api/package.json'));
const { PrismaClient } = requireApi('@operix/database');
const { PILOT_ROLES } = requireApi('@operix/permissions');
const ownerRole = PILOT_ROLES.find((role) => role.key === 'ght_owner');
const fileEnv = (() => {
  try {
    return parseEnv(readFileSync('backend/.env', 'utf8'));
  } catch {
    return {};
  }
})();
const url = new URL(process.env.TEST_DATABASE_URL ?? fileEnv.DATABASE_URL);
if (
  !['localhost', '127.0.0.1'].includes(url.hostname) ||
  !/^browser_test_[a-f0-9]{32}$/.test(env.schema)
)
  throw new Error('Activation fixtures require the disposable local browser schema');
url.searchParams.set('schema', env.schema);
const db = new PrismaClient({ datasourceUrl: url.toString() });
test.use({ trace: 'off', screenshot: 'off' }); // Explicit masked evidence only, never raw bearer links/MFA.
test.afterAll(() => db.$disconnect());

async function fixture({ expired = false, revoked = false, foreignBranch = false } = {}) {
  const id = randomUUID();
  const organization = await db.organization.create({
    data: {
      name: 'SYNTHETIC Activation Workspace',
      slug: `activation-${id}`,
      status: 'ACTIVE',
      settings: { security: { mfaRequiredRoleKeys: ['ght_owner'] } },
    },
  });
  const role = await db.role.create({
    data: {
      organizationId: organization.id,
      name: 'SYNTHETIC Owner',
      systemKey: 'ght_owner',
      permissions: [...ownerRole.permissions],
      dataScope: ownerRole.dataScope,
      isSystem: true,
    },
  });
  for (const module of await db.module.findMany({
    where: { key: { in: ['core', 'crm', 'sales', 'projects'] } },
  }))
    await db.organizationModule.create({
      data: { organizationId: organization.id, moduleId: module.id, enabled: true },
    });
  const branchIds = [];
  if (foreignBranch) {
    const other = await db.organization.create({
      data: { name: 'SYNTHETIC Other Tenant', slug: `other-${id}` },
    });
    const branch = await db.branch.create({
      data: {
        organizationId: other.id,
        code: 'OTHER',
        name: 'Other tenant',
        country: 'US',
        currency: 'USD',
        timezone: 'UTC',
      },
    });
    branchIds.push(branch.id);
  }
  const token = randomBytes(32).toString('base64url');
  const email = `activation.${id}@browser.test`;
  const invitation = await db.invitation.create({
    data: {
      organizationId: organization.id,
      email,
      roleId: role.id,
      branchIds,
      invitedBy: randomUUID(),
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + (expired ? -60_000 : 3_600_000)),
      ...(revoked ? { revokedAt: new Date() } : {}),
    },
  });
  return {
    organization,
    role,
    invitation,
    token,
    email,
    password: `Synthetic-${randomBytes(16).toString('hex')}`,
  };
}

const activationUrl = (f) => `${env.web}/#/accept-invite?token=${encodeURIComponent(f.token)}`;
async function fields(page, f, confirm = f.password) {
  await page.getByLabel('First name').fill('Synthetic');
  await page.getByLabel('Last name').fill('Tester');
  await page.getByLabel('New password', { exact: true }).fill(f.password);
  await page.getByLabel('Confirm password').fill(confirm);
}
async function open(page, f) {
  await page.goto(activationUrl(f));
  await expect(page.getByRole('heading', { name: 'Activate your Operix account' })).toBeVisible();
}
async function submit(page) {
  const result = page.waitForResponse(
    (r) => r.url().endsWith('/auth/invitations/accept') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Activate account' }).click();
  return (await result).status();
}

test('valid owner invitation creates password, correct tenant/role, MFA and a usable session', async ({
  page,
}) => {
  const f = await fixture();
  await open(page, f);
  await fields(page, f, 'Different-synthetic-password');
  await page.getByRole('button', { name: 'Activate account' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await db.user.count({ where: { email: f.email } })).toBe(0);
  await page.getByLabel('Confirm password').fill(f.password);
  expect(await submit(page)).toBe(201);
  await expect(page.getByRole('heading', { name: 'Sign in to Operix' })).toBeVisible();
  expect(new URL(page.url()).hash.includes('token=')).toBe(false);
  const user = await db.user.findUniqueOrThrow({ where: { email: f.email } });
  expect(user.passwordHash).not.toBe(f.password);
  expect(user.passwordHash).toMatch(/^\$argon2id\$/);
  const member = await db.organizationUser.findUniqueOrThrow({
    where: { organizationId_userId: { organizationId: f.organization.id, userId: user.id } },
  });
  expect(member.roleId).toBe(f.role.id);
  expect(member.isOwner).toBe(true);
  await page.getByLabel('Work email').fill(f.email);
  await page.getByLabel('Password', { exact: true }).fill(f.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Your role requires two-step sign-in')).toBeVisible();
  await page.getByLabel('Password', { exact: true }).fill(f.password);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const secret = (await page.locator('.px-qr code').innerText()).replace(/\s/g, '');
  await page.getByLabel('6-digit code').fill(totp(secret));
  await page.getByRole('button', { name: 'Turn on two-step sign-in' }).click();
  await expect(page.getByText('Two-step sign-in is on.')).toBeVisible();
  expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).mfaEnabled).toBe(true);
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Dashboard', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Welcome, Synthetic' })).toBeVisible();
  const foreign = await fixture();
  const crossTenantStatus = await page.evaluate(
    async ({ api, organizationId }) => {
      const current = JSON.parse(localStorage.getItem('operix.pilot.session'));
      return (
        await fetch(`${api}/api/v1/records/customers`, {
          headers: {
            Authorization: `Bearer ${current.accessToken}`,
            'x-organization-id': organizationId,
          },
        })
      ).status;
    },
    { api: env.api, organizationId: foreign.organization.id },
  );
  expect(crossTenantStatus).toBe(403);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to Operix' })).toBeVisible();
  await expect(page).toHaveURL(`${env.web}/login`);
  expect(await page.evaluate(() => localStorage.getItem('operix.pilot.session'))).toBeNull();
  await page.goto(`${env.web}/dashboard`);
  await expect(page).toHaveURL(`${env.web}/login`);
});

for (const kind of ['expired', 'revoked', 'invalid', 'reused', 'foreignBranch']) {
  test(`${kind} invitation cannot create a membership or change a password`, async ({
    page,
    request,
  }) => {
    const f = await fixture({ [kind]: true });
    if (kind === 'invalid') f.token = randomBytes(32).toString('base64url');
    if (kind === 'reused') {
      const first = await request.post(`${env.api}/api/v1/auth/invitations/accept`, {
        data: { token: f.token, firstName: 'Synthetic', lastName: 'Tester', password: f.password },
      });
      expect(first.status()).toBe(201);
    }
    const before = await db.organizationUser.count({
      where: { organizationId: f.organization.id },
    });
    await open(page, f);
    await fields(page, f);
    expect(await submit(page)).toBe(kind === 'foreignBranch' ? 400 : 401);
    await expect(page.getByRole('alert')).toBeVisible();
    expect(await db.organizationUser.count({ where: { organizationId: f.organization.id } })).toBe(
      before,
    );
    if (kind !== 'reused') expect(await db.user.count({ where: { email: f.email } })).toBe(0);
  });
}

test('unauthenticated business API denies access while invitation form stays reachable', async ({
  page,
  request,
}) => {
  expect((await request.get(`${env.api}/api/v1/records/customers`)).status()).toBe(401);
  await page.goto(`${env.web}/#/accept-invite`);
  await expect(page.getByRole('heading', { name: 'Activate your Operix account' })).toBeVisible();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
});

for (const [name, width, height] of [
  ['desktop', 1365, 900],
  ['mobile', 390, 844],
]) {
  test(`activation form is usable on ${name}`, async ({ page }) => {
    const f = await fixture();
    await page.setViewportSize({ width, height });
    await open(page, f);
    await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    mkdirSync('e2e/evidence/activation', { recursive: true });
    await page.screenshot({
      path: `e2e/evidence/activation/${name}-form.png`,
      mask: [page.locator('input')],
    });
    writeFileSync(
      `e2e/evidence/activation/${name}-route.json`,
      JSON.stringify({
        route: '/#/accept-invite',
        invitationPresent: true,
        actualTokenWithheld: true,
        width,
        height,
      }),
    );
  });
}

test('public landing, canonical login, unknown account and protected routes', async ({
  page,
  request,
}) => {
  await page.goto(env.web);
  await expect(page.getByRole('heading', { level: 1, name: /Manage everything/ })).toBeVisible();
  await page.getByRole('link', { name: 'Login', exact: true }).first().click();
  await expect(page).toHaveURL(`${env.web}/login`);
  await expect(page.getByRole('heading', { name: 'Sign in to Operix' })).toBeVisible();
  await page.getByLabel('Work email').fill(`unknown-${randomUUID()}@browser.test`);
  await page.getByLabel('Password', { exact: true }).fill('Synthetic-unknown-password');
  const denied = page.waitForResponse(
    (r) => r.url().endsWith('/auth/login') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  expect((await denied).status()).toBe(401);
  await expect(page.getByRole('alert')).toContainText('email or password is incorrect');
  expect(await page.evaluate(() => localStorage.getItem('operix.pilot.session'))).toBeNull();
  for (const path of ['/dashboard', '/team', '/projects', '/customers', '/#/team']) {
    await page.goto(env.web + path);
    await expect(page).toHaveURL(`${env.web}/login`);
    await expect(page.getByRole('heading', { name: 'Sign in to Operix' })).toBeVisible();
  }
  for (const path of [
    '/auth/me',
    '/organization/users',
    '/organization/invitations',
    '/records/customers',
    '/workspace/dashboard',
    '/platform/plans',
  ]) {
    expect((await request.get(`${env.api}/api/v1${path}`)).status()).toBe(401);
  }
  for (const path of ['/auth/register', '/auth/signup']) {
    expect((await request.post(`${env.api}/api/v1${path}`, { data: {} })).status()).toBe(404);
  }
  expect((await request.get(`${env.api}/docs`)).status()).toBe(404);
});

for (const [name, width, height] of [
  ['desktop', 1365, 900],
  ['mobile', 390, 844],
]) {
  test(`existing public landing and Login navigation work on ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto(env.web);
    await expect(page.getByRole('heading', { level: 1, name: /Manage everything/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Login', exact: true }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    mkdirSync('e2e/evidence/activation', { recursive: true });
    await page.screenshot({ path: `e2e/evidence/activation/${name}-landing.png` });
    await page.getByRole('link', { name: 'Login', exact: true }).first().click();
    await expect(page).toHaveURL(`${env.web}/login`);
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
    expect(await page.getByRole('link', { name: /register|sign up/i }).count()).toBe(0);
  });
}
