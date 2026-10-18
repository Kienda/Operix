import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as argon2 from 'argon2';
import { afterAll, inject } from 'vitest';
import { PrismaClient } from '@operix/database';
import { MODULE_DEFINITIONS, getSystemRole } from '@operix/permissions';
import { RESULTS_DIR } from './env';

export const uid = () => randomUUID();
const short = () => randomUUID().slice(0, 8);

/** One random password per test process; never logged or persisted. */
const PASSWORD = randomBytes(24).toString('base64url');
let passwordHash: Promise<string> | undefined;
let client: PrismaClient | undefined;

export const apiUrl = () => inject('apiUrl');
export function db(): PrismaClient {
  if (!client) {
    const url = new URL(inject('databaseUrl'));
    url.searchParams.set('connection_limit', '4');
    client = new PrismaClient({ datasourceUrl: url.toString() });
  }
  return client;
}
// Each spec file gets its own module instance; release its pool when the file ends.
afterAll(async () => {
  await client?.$disconnect();
});

export interface Res<T = any> {
  status: number;
  body: T;
}
export interface Actor {
  alias: string;
  roleKey: string;
  email: string;
  userId: string;
  orgId: string;
  branchIds: string[];
  accessToken: string;
  refreshToken: string;
  /** Effective permissions as returned by login. */
  permissions: string[];
}

export async function call<T = any>(
  actor: Actor | null,
  method: string,
  path: string,
  body?: unknown,
  opts: { orgId?: string; token?: string } = {},
): Promise<Res<T>> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (actor || opts.token) {
    headers.authorization = `Bearer ${opts.token ?? actor!.accessToken}`;
    headers['x-organization-id'] = opts.orgId ?? actor!.orgId;
  }
  const response = await fetch(apiUrl() + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let parsed: any = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // keep raw text
  }
  return { status: response.status, body: parsed };
}

export function login(email: string, password = PASSWORD, extra: Record<string, unknown> = {}) {
  return call(null, 'POST', '/auth/login', { email, password, ...extra });
}
export const testPassword = () => PASSWORD;

// ------------------------------------------------------------------ tenants

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  branches: Record<string, string>;
  roles: Map<string, string>;
}
type BranchSpec = { code: string; name: string; country: string; currency: string; timezone: string };

let modulesReady: Promise<unknown> | undefined;
/** Mirrors the main seed: every tenant module except the platform and portal planes. */
function ensureModules() {
  return (modulesReady ??= Promise.all(
    MODULE_DEFINITIONS.filter((m) => m.key !== 'platform' && m.key !== 'portal').map((m) =>
      db().module.upsert({
        where: { key: m.key },
        update: {},
        create: { key: m.key, name: m.name, description: m.description },
      }),
    ),
  ));
}

export async function createTenant(label: string, branches: BranchSpec[]): Promise<Tenant> {
  await ensureModules();
  const slug = `qa-${label}-${short()}`;
  const org = await db().organization.create({
    data: { name: `QA ${label} ${slug}`, slug, status: 'ACTIVE', defaultCurrency: 'USD', timezone: 'UTC' },
  });
  const tenant: Tenant = { id: org.id, slug, name: org.name, branches: {}, roles: new Map() };
  for (const b of branches) {
    const row = await db().branch.create({ data: { ...b, organizationId: org.id } });
    tenant.branches[b.code] = row.id;
  }
  for (const m of await db().module.findMany())
    await db().organizationModule.create({ data: { organizationId: org.id, moduleId: m.id } });
  return tenant;
}

const roleFields = () =>
  new Set(
    (db() as unknown as { _runtimeDataModel: { models: Record<string, { fields: { name: string }[] }> } })
      ._runtimeDataModel.models.Role.fields.map((f) => f.name),
  );

async function roleFor(tenant: Tenant, roleKey: string, permissions?: string[]) {
  const cacheKey = permissions ? `${roleKey}:${permissions.join(',')}` : roleKey;
  const cached = tenant.roles.get(cacheKey);
  if (cached) return cached;
  const definition = getSystemRole(roleKey);
  if (!definition) throw new Error(`Unknown role ${roleKey}`);
  const fields = roleFields();
  const role = await db().role.create({
    data: {
      organizationId: tenant.id,
      name: permissions ? `${definition.name} (custom ${short()})` : definition.name,
      description: definition.description,
      permissions: permissions ?? definition.permissions,
      isSystem: !permissions,
      ...(fields.has('systemKey') ? { systemKey: definition.key } : {}),
      ...(fields.has('dataScope') ? { dataScope: definition.dataScope } : {}),
    } as never,
  });
  tenant.roles.set(cacheKey, role.id);
  return role.id;
}

export interface ActorOptions {
  alias: string;
  branches?: string[];
  customerId?: string;
  employeeId?: string;
  overrides?: unknown;
  permissions?: string[];
}

export async function createActor(tenant: Tenant, roleKey: string, opts: ActorOptions): Promise<Actor> {
  passwordHash ??= argon2.hash(PASSWORD, { type: argon2.argon2id });
  const email = `${opts.alias.toLowerCase()}.${short()}@qa.operix.test`;
  const user = await db().user.create({
    data: { email, firstName: 'QA', lastName: opts.alias, passwordHash: await passwordHash },
  });
  const branchIds = (opts.branches ?? []).map((code) => {
    const branchId = tenant.branches[code];
    if (!branchId) throw new Error(`Unknown branch ${code}`);
    return branchId;
  });
  await db().organizationUser.create({
    data: {
      organizationId: tenant.id,
      userId: user.id,
      roleId: await roleFor(tenant, roleKey, opts.permissions),
      branchIds,
      ...(opts.overrides !== undefined ? { permissionOverrides: opts.overrides as never } : {}),
      ...(opts.customerId ? { customerId: opts.customerId } : {}),
      ...(opts.employeeId ? { employeeId: opts.employeeId } : {}),
    } as never,
  });
  const res = await login(email);
  if (res.status !== 201) throw new Error(`Login failed for ${roleKey}: ${res.status} ${JSON.stringify(res.body)}`);
  return {
    alias: opts.alias,
    roleKey,
    email,
    userId: user.id,
    orgId: tenant.id,
    branchIds,
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
    permissions: res.body.permissions ?? [],
  };
}

// ------------------------------------------------------------ API helpers

/** Creates a generic record through the API and fails loudly when it cannot. */
export async function rec(
  actor: Actor,
  module: string,
  name: string,
  opts: { branchId?: string; data?: Record<string, unknown>; type?: string; number?: string } = {},
) {
  const res = await call(actor, 'POST', '/records', {
    module,
    type: opts.type ?? module.replace(/s$/, ''),
    name,
    ...(opts.number ? { number: opts.number } : {}),
    ...(opts.branchId ? { branchId: opts.branchId } : {}),
    data: opts.data ?? {},
  });
  if (res.status !== 201)
    throw new Error(`Fixture ${module} create failed (${res.status}): ${JSON.stringify(res.body)}`);
  return res.body as { id: string; status: string; branchId: string | null; data: Record<string, unknown> };
}

export async function invoice(
  actor: Actor,
  customerId: string,
  branchId: string,
  amount: number | string,
  currency = 'USD',
) {
  const res = await call(actor, 'POST', '/finance/invoices', {
    customerId,
    branchId,
    number: `INV-${short()}`,
    currency,
    subtotal: amount,
    tax: 0,
  });
  if (res.status !== 201) throw new Error(`Fixture invoice failed (${res.status}): ${JSON.stringify(res.body)}`);
  return res.body as { id: string; total: string; paid: string; status: string };
}

export function paymentBody(
  customerId: string,
  branchId: string,
  amount: number | string,
  allocations: Array<{ invoiceId: string; amount: number | string }>,
  currency = 'USD',
) {
  return {
    customerId,
    branchId,
    number: `PAY-${short()}`,
    amount,
    currency,
    method: 'BANK_TRANSFER',
    receivedAt: new Date().toISOString(),
    allocations,
  };
}

/** Conakry, Kaloum peninsula — used as the GN branch site. */
export const SITE = { latitude: 9.5092, longitude: -13.7122 };
export const fix = (accuracyMeters = 10, offset = 0) => ({
  latitude: SITE.latitude + offset,
  longitude: SITE.longitude,
  accuracyMeters,
});

// ------------------------------------------------------------------ world

export interface World {
  ght: Tenant;
  atlas: Tenant;
  HQ: string;
  GN: string;
  AT: string;
  a: Record<
    | 'owner' | 'admin' | 'branchManager' | 'finance' | 'accountant' | 'salesManager' | 'sales'
    | 'projectManager' | 'inventory' | 'purchasing' | 'hr' | 'supervisor' | 'guard' | 'employee'
    | 'employee2' | 'viewer' | 'customer' | 'platform' | 'atlasAdmin' | 'atlasEmployee' | 'atlasCustomer',
    Actor
  >;
  r: {
    customerA: string;
    customerB: string;
    customerC: string;
    employeeProfileA: string;
    employeeProfileB: string;
    guardProfile: string;
    atlasCustomer: string;
    atlasProject: string;
    atlasInvoice: string;
  };
}

/**
 * Standard two-tenant, two-branch world used by every QA spec.
 *
 * GHT  : HQ (USD) and GN (GNF) branches; one account per representative role.
 * Atlas: a second tenant that exists only to prove isolation.
 */
export async function buildWorld(): Promise<World> {
  const ght = await createTenant('ght', [
    { code: 'HQ', name: 'GHT Headquarters', country: 'US', currency: 'USD', timezone: 'America/New_York' },
    { code: 'GN', name: 'GHT Guinea Operations', country: 'GN', currency: 'GNF', timezone: 'Africa/Conakry' },
  ]);
  const atlas = await createTenant('atlas', [
    { code: 'AT', name: 'Atlas Main', country: 'GN', currency: 'USD', timezone: 'Africa/Conakry' },
  ]);
  const HQ = ght.branches.HQ, GN = ght.branches.GN, AT = atlas.branches.AT;

  const owner = await createActor(ght, 'company_owner', { alias: 'owner' });
  const customerA = (await rec(owner, 'customers', 'Northwind Dental Clinic', { branchId: HQ, type: 'company' })).id;
  const customerB = (await rec(owner, 'customers', 'Kaloum Retail Group', { branchId: GN, type: 'company' })).id;
  const customerC = (await rec(owner, 'customers', 'Fouta Agro Cooperative', { branchId: GN, type: 'company' })).id;
  const profile = (first: string, last: string, branchId: string, n: string) =>
    rec(owner, 'employees', `${first} ${last}`, {
      branchId,
      type: 'employee',
      data: {
        firstName: first,
        lastName: last,
        employeeNumber: n,
        bankAccountNumber: `QA-FAKE-${n}`,
        baseSalary: '1000.00',
        currency: 'USD',
      },
    });
  const employeeProfileA = (await profile('Aminata', 'Sow', HQ, '0001')).id;
  const employeeProfileB = (await profile('Ibrahima', 'Bah', HQ, '0002')).id;
  const guardProfile = (await profile('Mamadou', 'Kouyate', GN, '0003')).id;

  const actor = (role: string, opts: ActorOptions) => createActor(ght, role, opts);
  const a = {
    owner,
    admin: await actor('company_admin', { alias: 'admin' }),
    branchManager: await actor('branch_manager', { alias: 'branchManager', branches: ['GN'] }),
    finance: await actor('finance_manager', { alias: 'finance' }),
    accountant: await actor('accountant', { alias: 'accountant' }),
    salesManager: await actor('sales_manager', { alias: 'salesManager' }),
    sales: await actor('sales_representative', { alias: 'sales', branches: ['HQ'] }),
    projectManager: await actor('project_manager', { alias: 'projectManager', branches: ['HQ'] }),
    inventory: await actor('inventory_manager', { alias: 'inventory', branches: ['GN'] }),
    purchasing: await actor('purchasing_officer', { alias: 'purchasing', branches: ['GN'] }),
    hr: await actor('hr_manager', { alias: 'hr' }),
    supervisor: await actor('security_supervisor', { alias: 'supervisor', branches: ['GN'] }),
    guard: await actor('security_guard', { alias: 'guard', branches: ['GN'], employeeId: guardProfile }),
    employee: await actor('employee', { alias: 'employee', branches: ['HQ'], employeeId: employeeProfileA }),
    employee2: await actor('employee', { alias: 'employee2', branches: ['HQ'], employeeId: employeeProfileB }),
    viewer: await actor('readonly_user', { alias: 'viewer', branches: ['HQ'] }),
    customer: await actor('customer', { alias: 'customer', branches: ['HQ'], customerId: customerA }),
    platform: await actor('platform_super_admin', { alias: 'platform' }),
  } as World['a'];

  // Customer A is the sales representative's and project manager's assigned account.
  // (Assigned-scope roles can only reference customers assigned to them.)
  const assign = await call(owner, 'PATCH', `/records/customers/${customerA}`, {
    data: { salespersonUserId: a.sales.userId, projectManagerUserId: a.projectManager.userId },
  });
  if (assign.status !== 200) throw new Error(`Assigning customer A failed: ${JSON.stringify(assign.body)}`);

  a.atlasAdmin = await createActor(atlas, 'company_admin', { alias: 'atlasAdmin' });
  const atlasCustomer = (await rec(a.atlasAdmin, 'customers', 'Atlas Client One', { branchId: AT })).id;
  const atlasProject = (await rec(a.atlasAdmin, 'projects', 'Atlas Intranet', { branchId: AT, data: { customerId: atlasCustomer } })).id;
  const atlasInvoice = (await invoice(a.atlasAdmin, atlasCustomer, AT, 500)).id;
  a.atlasEmployee = await createActor(atlas, 'employee', { alias: 'atlasEmployee', branches: ['AT'] });
  a.atlasCustomer = await createActor(atlas, 'customer', { alias: 'atlasCustomer', branches: ['AT'], customerId: atlasCustomer });

  return {
    ght,
    atlas,
    HQ,
    GN,
    AT,
    a,
    r: { customerA, customerB, customerC, employeeProfileA, employeeProfileB, guardProfile, atlasCustomer, atlasProject, atlasInvoice },
  };
}

// ---------------------------------------------------------------- evidence

/** Appends structured evidence rows to tmp/qa-e2e/<name>.json (gitignored). */
export function writeEvidence(name: string, rows: unknown) {
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(resolve(RESULTS_DIR, `${name}.json`), JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2));
}
