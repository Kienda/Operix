// GHT production-pilot acceptance suite (release gate).
// Real HTTP stack + PostgreSQL schema + SMTP (Mailpit). Starts from the real
// bootstrap CLI and the real invitation emails; no seeded/demo accounts.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { generate } from 'otplib';
import { startStack, client, mailTo, mailCount, tokenFrom, MAILPIT } from './support/harness.mjs';

const run = randomUUID().slice(0, 8);
const email = (who) => `${who}.${run}@pilot.test`.toLowerCase();
const password = () => `Pilot-${randomBytes(12).toString('base64url')}`;
let stack, call, org, us, gn;
const people = {}; // key -> { email, password, secret?, session }

async function login(person, extra = {}) {
  const body = { email: person.email, password: person.password, ...extra };
  if (person.secret && !extra.mfaCode) body.mfaCode = await generate({ secret: person.secret });
  const res = await call('POST', '/auth/login', null, body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  person.session = res.body;
  return res.body;
}
async function enrollMfa(person) {
  const enroll = await call('POST', '/auth/mfa/enroll', person.session, { password: person.password });
  expect(enroll.status).toBe(201);
  const confirm = await call('POST', '/auth/mfa/confirm', person.session, {
    code: await generate({ secret: enroll.body.secret }),
  });
  expect(confirm.status).toBe(201);
  person.secret = enroll.body.secret;
}
/** Accepts the emailed invitation, signs in and (when required) enrolls MFA. */
async function onboard(key, first, last, subject = 'invited') {
  const person = people[key];
  const mail = await mailTo(person.email, { subject });
  const accepted = await call('POST', '/auth/invitations/accept', null, {
    token: tokenFrom(mail.text, 'accept-invite'),
    firstName: first,
    lastName: last,
    password: person.password,
  });
  expect(accepted.status, JSON.stringify(accepted.body)).toBe(201);
  const session = await login(person);
  if (session.mfaEnrollmentRequired) {
    await enrollMfa(person);
    await login(person);
  }
  return person.session;
}
async function invite(by, key, roleKey, branchIds) {
  const roles = await call('GET', '/organization/assignable-roles', people[by].session);
  const role = roles.body.find((r) => r.key === roleKey);
  expect(role, `${by} cannot assign ${roleKey}`).toBeTruthy();
  people[key] = { email: email(key), password: password() };
  const res = await call('POST', '/organization/invitations', people[by].session, {
    email: people[key].email,
    roleId: role.id,
    branchIds,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res;
}
const s = (key) => people[key].session;
const create = (key, module, name, data = {}, extra = {}) =>
  call('POST', '/records', s(key), { module, type: module.slice(0, -1), name, data, ...extra });
const ids = (res) => res.body.data.map((r) => r.id);

beforeAll(async () => {
  stack = await startStack({ env: { OPERIX_MODULE_ALLOWLIST: 'core,crm,sales,projects' } });
  call = client(stack.base);
}, 180_000);
afterAll(async () => {
  await stack?.stop();
});

describe('Bootstrap and owner activation', () => {
  it('dry run writes nothing', () => {
    const out = stack.cli('dist/cli/bootstrap-pilot.js', ['--owner-email', email('owner'), '--dry-run']);
    expect(out).toContain('DRY RUN');
    return stack.db.organization.count().then((n) => expect(n).toBe(0));
  });

  it('creates one GHT organization with USA/Guinea branches, pilot roles and pilot-only modules', async () => {
    const out = stack.cli('dist/cli/bootstrap-pilot.js', ['--owner-email', email('owner')]);
    expect(out).toContain('Owner invitation emailed');
    expect(out).not.toMatch(/token=/); // the link is not printed when mail works
    org = await stack.db.organization.findUniqueOrThrow({
      where: { slug: 'global-high-tech' },
      include: { branches: true, roles: true, enabledModules: { include: { module: true } } },
    });
    us = org.branches.find((b) => b.code === 'US');
    gn = org.branches.find((b) => b.code === 'GN');
    expect([us.currency, gn.currency, gn.timezone]).toEqual(['USD', 'GNF', 'Africa/Conakry']);
    expect(org.roles.map((r) => r.systemKey).sort()).toEqual(
      [
        'ght_admin',
        'ght_employee',
        'ght_finance',
        'ght_owner',
        'ght_production',
        'ght_project_manager',
        'ght_sales',
        'ght_sales_manager',
      ].sort(),
    );
    const enabled = org.enabledModules.filter((m) => m.enabled).map((m) => m.module.key).sort();
    expect(enabled).toEqual(['core', 'crm', 'projects', 'sales']);
    expect(await stack.db.user.count()).toBe(0); // no accounts, no passwords
    expect(await stack.db.businessRecord.count()).toBe(0); // no fabricated records
  });

  it('is idempotent and never issues a second owner invitation once an owner exists', async () => {
    people.owner = { email: email('owner'), password: password() };
    await onboard('owner', 'Aminata', 'Owner', 'Activate');
    expect(people.owner.session.isOwner).toBe(true);
    expect(people.owner.secret).toBeTruthy(); // owner role requires MFA
    const out = stack.cli('dist/cli/bootstrap-pilot.js', ['--owner-email', email('intruder')]);
    expect(out).toContain('Owner invitation skipped');
    expect(await stack.db.invitation.count({ where: { email: email('intruder') } })).toBe(0);
  });

  it('blocks business access until a required MFA enrollment is complete', async () => {
    const owner = people.owner;
    // Simulate an owner who has not enrolled yet.
    await stack.db.user.update({ where: { email: owner.email }, data: { mfaEnabled: false, mfaSecret: null } });
    const secret = owner.secret;
    owner.secret = undefined;
    await login(owner);
    expect(owner.session.mfaEnrollmentRequired).toBe(true);
    const blocked = await call('GET', '/records/customers', owner.session);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('MFA_ENROLLMENT_REQUIRED');
    expect((await call('GET', '/auth/me', owner.session)).status).toBe(200);
    expect(
      (await call('POST', '/auth/mfa/disable', owner.session, { password: owner.password })).status,
    ).toBe(403);
    await enrollMfa(owner);
    expect(secret).not.toBe(owner.secret);
    const noCode = await call('POST', '/auth/login', null, { email: owner.email, password: owner.password });
    expect(noCode.status).toBe(401);
    expect(noCode.body.error.code).toBe('MFA_REQUIRED');
    await login(owner);
    expect(owner.session.mfaEnrollmentRequired).toBe(false);
  });
});

describe('Secure staff invitations', () => {
  it('emails invitations without exposing the link or token hash to the inviter', async () => {
    const res = await invite('owner', 'admin', 'ght_admin', [us.id]);
    expect(res.body.delivered).toBe(true);
    expect(res.body.inviteUrl).toBeUndefined();
    const list = await call('GET', '/organization/invitations', s('owner'));
    expect(JSON.stringify(list.body)).not.toMatch(/tokenHash/);
    const mail = await mailTo(people.admin.email, { subject: 'invited' });
    expect(mail.text).toContain('Administrator');
    expect(mail.text).toMatch(/#\/accept-invite\?token=/);
    await onboard('admin', 'Ibrahim', 'Admin');
    expect(people.admin.secret).toBeTruthy();
  });

  it('onboards representative USA and Guinea staff', async () => {
    const plan = [
      ['owner', 'finance', 'ght_finance', []],
      ['owner', 'pmUS', 'ght_project_manager', [us.id]],
      ['owner', 'pmGN', 'ght_project_manager', [gn.id]],
      ['owner', 'salesMgrGN', 'ght_sales_manager', [gn.id]],
      ['owner', 'salesGN', 'ght_sales', [gn.id]],
      ['owner', 'salesGN2', 'ght_sales', [gn.id]],
      ['owner', 'productionGN', 'ght_production', [gn.id]],
      ['admin', 'employeeUS', 'ght_employee', [us.id]],
      ['owner', 'employeeGN', 'ght_employee', [gn.id]],
    ];
    for (const [by, key, role, branches] of plan) {
      await invite(by, key, role, branches);
      await onboard(key, key, 'Pilot');
    }
    expect(s('employeeGN').permissions).toEqual(['organization.view', 'tasks.update', 'tasks.view']);
    expect(s('employeeGN').branchIds).toEqual([gn.id]);
  });

  it('enforces the delegation ceiling', async () => {
    const roles = (await call('GET', '/organization/assignable-roles', s('admin'))).body;
    expect(roles.map((r) => r.key)).not.toContain('ght_owner');
    const owner = org.roles.find((r) => r.systemKey === 'ght_owner');
    const pm = org.roles.find((r) => r.systemKey === 'ght_project_manager');
    const attempt = (by, body) =>
      call('POST', '/organization/invitations', s(by), { email: email(randomUUID()), ...body });
    expect((await attempt('admin', { roleId: owner.id, branchIds: [us.id] })).status).toBe(403);
    expect((await attempt('admin', { roleId: pm.id, branchIds: [gn.id] })).status).toBe(403);
    expect((await attempt('admin', { roleId: pm.id, branchIds: [] })).status).toBe(400);
    expect((await attempt('salesMgrGN', { roleId: pm.id, branchIds: [gn.id] })).status).toBe(403);
    expect((await attempt('employeeGN', { roleId: pm.id, branchIds: [gn.id] })).status).toBe(403);
    const otherTenantRole = randomUUID();
    expect((await attempt('owner', { roleId: otherTenantRole, branchIds: [gn.id] })).status).toBe(400);
  });

  it('rejects reused, revoked, expired and replaced invitations', async () => {
    const pm = org.roles.find((r) => r.systemKey === 'ght_project_manager');
    const target = email('replaced');
    for (let i = 0; i < 2; i++)
      expect(
        (await call('POST', '/organization/invitations', s('owner'), { email: target, roleId: pm.id, branchIds: [gn.id] }))
          .status,
      ).toBe(201);
    let tokens = [];
    for (let i = 0; i < 50 && tokens.length < 2; i++) {
      tokens = (await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${target}"`)}`)).json()).messages;
      if (tokens.length < 2) await new Promise((r) => setTimeout(r, 100));
    }
    expect(tokens.length).toBe(2);
    const oldest = tokens[tokens.length - 1];
    const oldText = (await (await fetch(`${MAILPIT}/api/v1/message/${oldest.ID}`)).json()).Text;
    const accept = (token) =>
      call('POST', '/auth/invitations/accept', null, { token, firstName: 'A', lastName: 'B', password: password() });
    expect((await accept(tokenFrom(oldText, 'accept-invite'))).status).toBe(401); // replaced by resend
    const latest = await mailTo(target);
    const token = tokenFrom(latest.text, 'accept-invite');
    const pending = (await call('GET', '/organization/invitations', s('owner'))).body.find((i) => i.email === target);
    expect((await call('DELETE', `/organization/invitations/${pending.id}`, s('owner'))).status).toBe(200);
    expect((await accept(token)).status).toBe(401); // revoked
    const expiring = email('expired');
    await call('POST', '/organization/invitations', s('owner'), { email: expiring, roleId: pm.id, branchIds: [gn.id] });
    await stack.db.invitation.updateMany({ where: { email: expiring }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await accept(tokenFrom((await mailTo(expiring)).text, 'accept-invite'))).status).toBe(401);
    expect((await accept('not-a-real-token')).status).toBe(401);
  });

  it('requires the existing password when the invited email already has an account', async () => {
    // An existing Operix account is invited again (after its membership was removed).
    const existing = people.employeeUS;
    const pmRole = org.roles.find((r) => r.systemKey === 'ght_project_manager');
    await stack.db.organizationUser.delete({
      where: { organizationId_userId: { organizationId: org.id, userId: existing.session.user.id } },
    });
    await call('POST', '/organization/invitations', s('owner'), { email: existing.email, roleId: pmRole.id, branchIds: [us.id] });
    const token = tokenFrom((await mailTo(existing.email, { subject: 'invited', after: Date.now() - 5000 })).text, 'accept-invite');
    const wrong = await call('POST', '/auth/invitations/accept', null, { token, firstName: 'X', lastName: 'Y', password: password() });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe('EXISTING_ACCOUNT_PASSWORD_REQUIRED');
    const right = await call('POST', '/auth/invitations/accept', null, { token, firstName: 'X', lastName: 'Y', password: existing.password });
    expect(right.status).toBe(201);
    expect(right.body.existingAccount).toBe(true);
    // Restore the representative employee role for later tests.
    const employeeRole = org.roles.find((r) => r.systemKey === 'ght_employee');
    await stack.db.organizationUser.update({
      where: { organizationId_userId: { organizationId: org.id, userId: existing.session.user.id } },
      data: { roleId: employeeRole.id },
    });
    await login(existing);
  });
});

describe('Pilot module ceiling', () => {
  it('keeps finance, inventory, HR, attendance and other modules unreachable', async () => {
    for (const [method, path] of [
      ['GET', '/finance/summary'],
      ['GET', '/inventory/items'],
      ['GET', '/attendance/mine'],
      ['GET', '/records/employees'],
      ['GET', '/records/expenses'],
      ['GET', '/records/contracts'],
      ['GET', '/records/documents'],
    ])
      expect((await call(method, path, s('owner'))).status, path).toBe(403);
    // Even if a database flag or a personal override re-enables finance, the deployment ceiling holds.
    const finance = await stack.db.module.findUniqueOrThrow({ where: { key: 'finance' } });
    await stack.db.organizationModule.update({
      where: { organizationId_moduleId: { organizationId: org.id, moduleId: finance.id } },
      data: { enabled: true },
    });
    await stack.db.organizationUser.update({
      where: { organizationId_userId: { organizationId: org.id, userId: s('finance').user.id } },
      data: { permissionOverrides: [{ permission: 'invoices.create', effect: 'allow' }, { permission: 'invoices.view', effect: 'allow' }] },
    });
    try {
      expect((await call('GET', '/finance/summary', s('finance'))).status).toBe(403);
      expect(
        (await call('POST', '/finance/invoices', s('finance'), { customerId: randomUUID(), number: 'X', currency: 'USD', subtotal: '1', tax: '0' })).status,
      ).toBe(403);
      expect((await call('GET', '/auth/me', s('finance'))).body.permissions).not.toContain('invoices.create');
    } finally {
      await stack.db.organizationModule.update({
        where: { organizationId_moduleId: { organizationId: org.id, moduleId: finance.id } },
        data: { enabled: false },
      });
      await stack.db.organizationUser.update({
        where: { organizationId_userId: { organizationId: org.id, userId: s('finance').user.id } },
        data: { permissionOverrides: {} },
      });
    }
  });
});

let customerGN, customerUS, customerGN2, quote, project, taskGN, taskOther;

describe('Customers: branch, assignment and sensitive-field authorization', () => {
  it('assigns numbers, derives scope and validates fields', async () => {
    const created = await create('salesGN', 'customers', 'Kaloum Printing SARL', {
      kind: 'company',
      email: 'contact@kaloum.example',
      phone: '+224 620 00 00 00',
      country: 'GN',
      city: 'Conakry',
    }, { branchId: gn.id, status: 'ACTIVE' });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    customerGN = created.body;
    expect(customerGN.number).toBe('CUS-00001');
    expect((await create('salesGN', 'customers', 'Wrong branch', {}, { branchId: us.id })).status).toBe(403);
    expect((await create('salesGN', 'customers', 'Bad email', { email: 'nope' }, { branchId: gn.id })).status).toBe(400);
    expect((await create('salesGN', 'customers', 'Unknown field', { bankPin: '1' }, { branchId: gn.id })).status).toBe(400);
    expect((await create('salesGN', 'customers', 'Chosen number', {}, { branchId: gn.id, number: 'CUS-9' })).status).toBe(400);
    expect((await create('salesGN', 'customers', 'Sets tax id', { taxId: 'X' }, { branchId: gn.id })).status).toBe(403);
    const mgr = await create('salesMgrGN', 'customers', 'Bah Construction', { kind: 'company', taxId: 'GN-RCCM-42', paymentTerms: 'Net 30' }, { branchId: gn.id });
    expect(mgr.status).toBe(201);
    customerGN2 = mgr.body;
    const usCustomer = await create('admin', 'customers', 'Brooklyn Signs LLC', { kind: 'company', country: 'US' }, { branchId: us.id, status: 'ACTIVE' });
    expect(usCustomer.status).toBe(201);
    customerUS = usCustomer.body;
  });

  it('isolates branches and assignments on list, detail and search', async () => {
    expect((await call('GET', `/records/customers/${customerGN.id}`, s('salesGN2'))).status).toBe(404);
    expect(ids(await call('GET', '/records/customers', s('salesGN2')))).not.toContain(customerGN.id);
    expect((await call('GET', `/records/customers/${customerGN.id}`, s('salesMgrGN'))).status).toBe(200);
    for (const key of ['admin', 'pmUS']) {
      expect((await call('GET', `/records/customers/${customerGN.id}`, s(key))).status).toBe(404);
      expect(ids(await call('GET', '/records/customers', s(key)))).toEqual([customerUS.id]);
      expect((await call('GET', '/workspace/search?q=Kaloum', s(key))).body.data).toHaveLength(0);
    }
    expect(ids(await call('GET', '/records/customers', s('owner'))).sort()).toEqual(
      [customerGN.id, customerGN2.id, customerUS.id].sort(),
    );
    expect((await call('GET', `/records/customers/${customerUS.id}`, s('salesMgrGN'))).status).toBe(404);
    // A branch filter cannot widen scope.
    expect(ids(await call('GET', `/records/customers?branchId=${gn.id}`, s('admin')))).toEqual([]);
    for (const key of ['employeeGN', 'employeeUS'])
      expect((await call('GET', '/records/customers', s(key))).status).toBe(403);
  });

  it('hides customer financial fields from roles without customers.view_financials', async () => {
    const asFinance = await call('GET', `/records/customers/${customerGN2.id}`, s('finance'));
    expect(asFinance.body.data.taxId).toBe('GN-RCCM-42');
    const asProduction = await call('GET', `/records/customers/${customerGN2.id}`, s('productionGN'));
    expect(asProduction.status).toBe(200);
    expect(asProduction.body.data.taxId).toBeUndefined();
    expect(asProduction.body.data.paymentTerms).toBeUndefined();
    expect(JSON.stringify(asProduction.body)).not.toContain('GN-RCCM-42');
    expect((await call('PATCH', `/records/customers/${customerGN2.id}`, s('productionGN'), { name: 'x' })).status).toBe(403);
  });
});

describe('Quotations: server-computed totals and explicit lifecycle', () => {
  const lines = [
    { description: 'Vinyl banner 3m × 1m', quantity: '3', unitPrice: '150000' },
    { description: 'Installation', quantity: '1.5', unitPrice: '2000' },
  ];
  it('computes GNF and USD totals with currency precision', async () => {
    const created = await call('POST', '/quotations', s('salesGN'), {
      customerId: customerGN.id,
      title: 'Storefront signage',
      currency: 'GNF',
      taxRate: '18',
      validUntil: '2099-12-31',
      items: lines,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    quote = created.body;
    expect(quote.number).toMatch(/^QUO-\d{4}-0001$/);
    expect(quote.branchId).toBe(gn.id);
    expect(quote.status).toBe('DRAFT');
    expect([quote.data.subtotal, quote.data.tax, quote.data.total]).toEqual(['453000', '81540', '534540']);
    expect(quote.data.items[1].lineTotal).toBe('3000');
    const usd = await call('POST', '/quotations', s('admin'), {
      customerId: customerUS.id,
      title: 'Window graphics',
      currency: 'USD',
      taxRate: '7.25',
      items: [{ description: 'Decals', quantity: '3', unitPrice: '19.99' }],
    });
    expect(usd.status).toBe(201);
    expect([usd.body.data.subtotal, usd.body.data.tax, usd.body.data.total]).toEqual(['59.97', '4.35', '64.32']);
  });

  it('rejects client totals, invalid precision and generic writes', async () => {
    const base = { customerId: customerGN.id, title: 'X', currency: 'GNF', taxRate: '0', items: lines };
    expect((await call('POST', '/quotations', s('salesGN'), { ...base, total: '1' })).status).toBe(400);
    expect((await call('POST', '/quotations', s('salesGN'), { ...base, items: [{ description: 'x', quantity: '1', unitPrice: '10.50' }] })).status).toBe(400);
    expect((await call('POST', '/quotations', s('salesGN'), { ...base, taxRate: '101' })).status).toBe(400);
    expect((await call('POST', '/quotations', s('salesGN'), { ...base, items: [] })).status).toBe(400);
    expect((await call('POST', '/quotations', s('salesMgrGN'), { ...base, customerId: customerUS.id })).status).toBe(400);
    expect((await create('salesGN', 'quotations', 'generic', { total: '1' }, { branchId: gn.id })).status).toBe(400);
    expect((await call('PATCH', `/records/quotations/${quote.id}`, s('salesGN'), { data: { total: '1' } })).status).toBe(400);
  });

  it('enforces who may send and record the customer decision', async () => {
    expect((await call('POST', `/quotations/${quote.id}/send`, s('salesGN2'))).status).toBe(404);
    expect((await call('POST', `/quotations/${quote.id}/send`, s('salesGN'))).status).toBe(201);
    const edit = await call('PUT', `/quotations/${quote.id}`, s('salesGN'), {
      customerId: customerGN.id, title: 'Changed', currency: 'GNF', taxRate: '18', items: lines,
    });
    expect(edit.status).toBe(400);
    expect((await call('POST', `/quotations/${quote.id}/accept`, s('salesGN'))).status).toBe(403);
    expect((await call('POST', `/quotations/${quote.id}/accept`, s('pmGN'))).status).toBe(403);
    const accepted = await call('POST', `/quotations/${quote.id}/accept`, s('salesMgrGN'), { reason: 'Signed PO received' });
    expect(accepted.status).toBe(201);
    expect(accepted.body.status).toBe('APPROVED');
    expect(accepted.body.data.outcome).toBe('accepted');
    expect((await call('POST', `/quotations/${quote.id}/accept`, s('salesMgrGN'))).status).toBe(201); // idempotent
    expect((await call('POST', `/quotations/${quote.id}/cancel`, s('salesMgrGN'))).status).toBe(400);
    const actions = (await stack.db.auditLog.findMany({ where: { resourceId: quote.id }, orderBy: { createdAt: 'asc' } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['QUOTATION_CREATED', 'QUOTATION_SENT', 'QUOTATION_ACCEPTED']));
  });

  it('refuses to accept an expired quotation', async () => {
    const expired = await call('POST', '/quotations', s('salesMgrGN'), {
      customerId: customerGN2.id, title: 'Old offer', currency: 'USD', taxRate: '0', validUntil: '2020-01-01',
      items: [{ description: 'Design', quantity: '1', unitPrice: '100' }],
    });
    await call('POST', `/quotations/${expired.body.id}/send`, s('salesMgrGN'));
    expect((await call('POST', `/quotations/${expired.body.id}/accept`, s('salesMgrGN'))).status).toBe(400);
    expect((await call('POST', `/quotations/${expired.body.id}/decline`, s('salesMgrGN'), { reason: 'Too late' })).status).toBe(201);
  });
});

describe('Projects and tasks', () => {
  it('creates a branch project from the accepted quotation', async () => {
    expect(
      (await create('pmGN', 'projects', 'Gated', { customerId: customerGN.id, contractRequirement: 'before_work_starts' })).status,
    ).toBe(400);
    expect((await create('pmGN', 'projects', 'US customer', { customerId: customerUS.id })).status).toBe(400);
    const res = await create('pmGN', 'projects', 'Kaloum storefront signage', {
      customerId: customerGN.id,
      quotationId: quote.id,
      projectManagerUserId: s('pmGN').user.id,
      serviceType: 'Printing & installation',
      startDate: '2026-10-20',
      dueDate: '2026-11-15',
      budget: { amount: '534540', currency: 'GNF' },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    project = res.body;
    expect(project.branchId).toBe(gn.id);
    expect(project.number).toMatch(/^PRJ-\d{4}-0001$/);
    expect((await create('pmGN', 'projects', 'Bad dates', { startDate: '2026-11-15', dueDate: '2026-10-01' }, { branchId: gn.id })).status).toBe(400);
  });

  it('enforces branch isolation and budget visibility', async () => {
    expect((await call('GET', `/records/projects/${project.id}`, s('pmUS'))).status).toBe(404);
    const asProduction = await call('GET', `/records/projects/${project.id}`, s('productionGN'));
    expect(asProduction.status).toBe(200);
    expect(asProduction.body.data.budget).toBeUndefined();
    // Linked names are only resolved where the caller could read the record itself.
    expect(asProduction.body.related.records[customerGN.id].name).toBe('Kaloum Printing SARL');
    expect(asProduction.body.related.records[quote.id]).toBeUndefined();
    expect(asProduction.body.related.people[s('pmGN').user.id]).toBeTruthy();
    expect((await call('GET', `/records/projects/${project.id}`, s('finance'))).body.related.records[quote.id].number).toBe(quote.number);
    expect((await call('GET', `/records/projects/${project.id}`, s('finance'))).body.data.budget.amount).toBe('534540');
    expect((await call('GET', '/records/projects', s('employeeGN'))).status).toBe(403);
  });

  it('only moves status through audited commands', async () => {
    const path = `/projects/${project.id}`;
    expect((await call('PATCH', `/records/projects/${project.id}`, s('pmGN'), { status: 'COMPLETED' })).status).toBe(400);
    expect((await call('PATCH', `/records/projects/${project.id}`, s('pmGN'), { data: { holdReason: 'x' } })).status).toBe(400);
    expect((await call('POST', `${path}/start`, s('productionGN'))).status).toBe(403);
    expect((await call('POST', `${path}/start`, s('pmGN'))).body.status).toBe('IN_PROGRESS');
    expect((await call('POST', `${path}/hold`, s('pmGN'), {})).status).toBe(400);
    expect((await call('POST', `${path}/hold`, s('pmGN'), { reason: 'Waiting for vinyl delivery' })).body.status).toBe('PENDING');
    expect((await call('POST', `${path}/start`, s('pmGN'))).status).toBe(400);
    expect((await call('POST', `${path}/resume`, s('pmGN'))).body.status).toBe('IN_PROGRESS');
    expect((await call('POST', `${path}/hold`, s('pmUS'), { reason: 'x' })).status).toBe(404);
    const actions = (await stack.db.auditLog.findMany({ where: { resourceId: project.id } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['PROJECT_STARTED', 'PROJECT_ON_HOLD', 'PROJECT_RESUMED']));
  });

  it('plans tasks inside the project branch and assigns only eligible staff', async () => {
    expect((await create('productionGN', 'tasks', 'No project', {}, { branchId: gn.id })).status).toBe(400);
    expect(
      (await create('productionGN', 'tasks', 'Wrong assignee', { projectId: project.id, assigneeUserId: s('employeeUS').user.id })).status,
    ).toBe(400);
    const usProject = await create('pmUS', 'projects', 'Brooklyn decals', { customerId: customerUS.id });
    expect((await create('productionGN', 'tasks', 'Foreign project', { projectId: usProject.body.id })).status).toBe(400);
    const res = await create('productionGN', 'tasks', 'Print banners', {
      projectId: project.id,
      assigneeUserId: s('employeeGN').user.id,
      dueDate: '2026-10-28',
      priority: 'high',
    }, { status: 'PENDING' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    taskGN = res.body;
    expect(taskGN.branchId).toBe(gn.id);
    taskOther = (await create('pmGN', 'tasks', 'Site survey', { projectId: project.id, assigneeUserId: s('pmGN').user.id })).body;
    expect(
      (await call('PATCH', `/records/tasks/${taskGN.id}`, s('pmGN'), { data: { projectId: usProject.body.id } })).status,
    ).toBe(400);
    const dir = (await call('GET', '/organization/directory', s('pmGN'))).body.map((d) => d.userId);
    expect(dir).toContain(s('employeeGN').user.id);
    expect(dir).not.toContain(s('employeeUS').user.id);
    expect(JSON.stringify(dir)).not.toContain('@');
  });

  it('lets an employee see and progress only their own task', async () => {
    const mine = await call('GET', '/records/tasks?assignee=me', s('employeeGN'));
    expect(ids(mine)).toEqual([taskGN.id]);
    expect(ids(await call('GET', '/records/tasks', s('employeeGN')))).toEqual([taskGN.id]);
    expect((await call('GET', `/records/tasks/${taskOther.id}`, s('employeeGN'))).status).toBe(404);
    expect((await call('GET', `/records/tasks/${taskGN.id}`, s('employeeUS'))).status).toBe(404);
    // Field restrictions never run before visibility: no 403 that would confirm the record exists.
    expect((await call('PATCH', `/records/tasks/${taskGN.id}`, s('employeeUS'), { name: 'x' })).status).toBe(404);
    const t = `/records/tasks/${taskGN.id}`;
    expect((await call('PATCH', t, s('employeeGN'), { status: 'IN_PROGRESS' })).body.status).toBe('IN_PROGRESS');
    expect((await call('PATCH', t, s('employeeGN'), { data: { dueDate: '2027-01-01' } })).status).toBe(403);
    expect((await call('PATCH', t, s('employeeGN'), { name: 'Renamed' })).status).toBe(403);
    expect((await call('PATCH', t, s('employeeGN'), { status: 'CANCELLED' })).status).toBe(403);
    expect((await call('PATCH', t, s('employeeGN'), { data: { assigneeUserId: s('employeeUS').user.id } })).status).toBe(403);
    expect((await call('PATCH', t, s('employeeGN'), { status: 'COMPLETED' })).body.status).toBe('COMPLETED');
    expect((await call('DELETE', t, s('employeeGN'))).status).toBe(403);
    const dash = (await call('GET', '/workspace/dashboard', s('employeeGN'))).body.metrics;
    expect(dash.map((m) => m.label)).toEqual(['My open tasks']);
    expect((await call('GET', '/workspace/search?q=Site', s('employeeGN'))).body.data).toHaveLength(0);
  });

  it('completes the project', async () => {
    const done = await call('POST', `/projects/${project.id}/complete`, s('pmGN'));
    expect(done.body.status).toBe('COMPLETED');
    const dash = (await call('GET', '/workspace/dashboard', s('owner'))).body.metrics;
    expect(dash.some((m) => /receivable|payment/i.test(m.label))).toBe(false);
  });
});

describe('Access lifecycle and tenant isolation', () => {
  it('suspending a member revokes access immediately; reactivation restores it', async () => {
    const members = (await call('GET', '/organization/users', s('admin'))).body;
    expect(members.every((m) => m.branchIds.includes(us.id))).toBe(true); // US admin only sees US staff
    const target = members.find((m) => m.user.email === people.employeeUS.email);
    const ownerRow = (await call('GET', '/organization/users', s('owner'))).body.find((m) => m.isOwner);
    expect((await call('POST', `/organization/users/${ownerRow.id}/suspend`, s('admin'))).status).toBe(404);
    const self = members.find((m) => m.user.email === people.admin.email);
    expect((await call('POST', `/organization/users/${self.id}/suspend`, s('admin'))).status).toBe(400);
    const before = people.employeeUS.session;
    expect((await call('POST', `/organization/users/${target.id}/suspend`, s('admin'))).status).toBe(201);
    expect((await call('GET', '/records/tasks', before)).status).toBe(401);
    expect((await call('POST', '/auth/refresh', null, { refreshToken: before.refreshToken })).status).toBe(401);
    expect((await call('POST', '/auth/login', null, { email: people.employeeUS.email, password: people.employeeUS.password })).status).toBe(401);
    expect((await call('POST', `/organization/users/${target.id}/reactivate`, s('admin'))).status).toBe(201);
    await login(people.employeeUS);
    expect((await call('GET', '/records/tasks', s('employeeUS'))).status).toBe(200);
  });

  it('prevents moving members outside the manager scope or promoting to owner', async () => {
    const members = (await call('GET', '/organization/users', s('admin'))).body;
    const target = members.find((m) => m.user.email === people.employeeUS.email);
    const owner = org.roles.find((r) => r.systemKey === 'ght_owner');
    const pm = org.roles.find((r) => r.systemKey === 'ght_project_manager');
    expect((await call('PATCH', `/organization/users/${target.id}`, s('admin'), { roleId: owner.id })).status).toBe(403);
    expect((await call('PATCH', `/organization/users/${target.id}`, s('admin'), { branchIds: [gn.id] })).status).toBe(403);
    const promoted = await call('PATCH', `/organization/users/${target.id}`, s('admin'), { roleId: pm.id });
    expect(promoted.status).toBe(200);
    const audit = await stack.db.auditLog.findFirst({ where: { resourceId: target.id, action: 'MEMBERSHIP_UPDATED' } });
    expect(audit.before.roleId).not.toBe(audit.after.roleId);
    const employee = org.roles.find((r) => r.systemKey === 'ght_employee');
    expect((await call('PATCH', `/organization/users/${target.id}`, s('admin'), { roleId: employee.id })).status).toBe(200);
  });

  it('denies another tenant even with a valid session', async () => {
    const other = await stack.db.organization.create({ data: { name: 'Foreign tenant', slug: `foreign-${run}`, status: 'ACTIVE' } });
    const role = await stack.db.role.create({
      data: { organizationId: other.id, name: 'Owner', permissions: ['customers.view', 'projects.view', 'tasks.view'], dataScope: 'all', systemKey: 'ght_owner' },
    });
    const crm = await stack.db.module.findUniqueOrThrow({ where: { key: 'crm' } });
    await stack.db.organizationModule.create({ data: { organizationId: other.id, moduleId: crm.id } });
    const foreigner = { email: email('foreigner'), password: password() };
    const { default: argon2 } = await import('argon2');
    const user = await stack.db.user.create({
      data: { email: foreigner.email, firstName: 'F', lastName: 'T', passwordHash: await argon2.hash(foreigner.password) },
    });
    await stack.db.organizationUser.create({ data: { organizationId: other.id, userId: user.id, roleId: role.id } });
    const session = await login(foreigner);
    expect((await call('GET', '/records/customers', session, undefined, org.id)).status).toBe(403);
    expect((await call('GET', `/records/customers/${customerGN.id}`, session)).status).toBe(404);
    expect((await call('GET', '/records/customers', session)).body.data).toHaveLength(0);
    expect((await call('GET', '/records/customers')).status).toBe(401);
  });
});

describe('Authentication hardening', () => {
  it('rate-limits repeated failed sign-ins per identity', async () => {
    const target = { email: email('bruteforce') };
    const statuses = [];
    for (let i = 0; i < 12; i++)
      statuses.push((await call('POST', '/auth/login', null, { email: target.email, password: 'wrong-password' })).status);
    expect(statuses.slice(0, 10).every((x) => x === 401)).toBe(true);
    const limited = await call('POST', '/auth/login', null, { email: target.email, password: 'wrong-password' });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('rotates refresh tokens once under concurrency', async () => {
    const person = people.salesGN2;
    await login(person);
    const results = await Promise.all(
      [0, 1, 2].map(() => call('POST', '/auth/refresh', null, { refreshToken: person.session.refreshToken })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
  });

  it('delivers a single-use password reset by email and revokes old sessions', async () => {
    const person = people.salesGN2;
    const old = await login(person);
    const unknown = await call('POST', '/auth/forgot-password', null, { email: email('nobody') });
    expect(unknown.status).toBe(201);
    expect(await mailCount(email('nobody'))).toBe(0);
    const started = Date.now();
    expect((await call('POST', '/auth/forgot-password', null, { email: person.email })).status).toBe(201);
    const token = tokenFrom((await mailTo(person.email, { subject: 'Reset', after: started - 1000 })).text, 'reset-password');
    const next = password();
    expect((await call('POST', '/auth/reset-password', null, { token, password: 'short' })).status).toBe(400);
    expect((await call('POST', '/auth/reset-password', null, { token, password: next })).status).toBe(201);
    expect((await call('POST', '/auth/reset-password', null, { token, password: password() })).status).toBe(401);
    expect((await call('GET', '/auth/me', old)).status).toBe(401);
    person.password = next;
    await login(person);
  });

  it('logs out by revoking the session', async () => {
    const person = people.salesGN2;
    expect((await call('POST', '/auth/logout', person.session)).status).toBe(201);
    expect((await call('GET', '/auth/me', person.session)).status).toBe(401);
  });

  it('exposes liveness/readiness and sanitizes errors', async () => {
    expect((await fetch(`${stack.base}/api/v1/health/live`)).status).toBe(200);
    const health = await fetch(`${stack.base}/api/v1/health`);
    expect(health.status).toBe(200);
    expect(health.headers.get('x-request-id')).toBeTruthy();
    const bad = await call('GET', '/records/customers?status=NOT_A_STATUS', s('owner'));
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).not.toMatch(/prisma|invocation|stack/i);
  });
});
