import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@operix/database';
import {
  buildAbility,
  MODULE,
  type DataScope,
  type ModuleKey,
  type PermissionOverride,
} from '@operix/permissions';
import type { AuthContext } from './request-context';
import { config } from '../platform/config';

type Store = Prisma.TransactionClient;
type Membership = Prisma.OrganizationUserGetPayload<{ include: { role: true } }>;
type MfaFacts = { mfaEnabled: boolean; organizationSettings: unknown };
const scopes = new Set(['all', 'branch', 'assigned', 'self', 'customer']);
const none = { id: { in: [] as string[] } };
export const jsonObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function parseOverrides(value: unknown): PermissionOverride[] {
  const entries = Array.isArray(value)
    ? value
    : Object.entries(jsonObject(value)).map(([permission, effect]) => ({ permission, effect }));
  return entries.flatMap<PermissionOverride>((raw) => {
    const o = jsonObject(raw);
    if (typeof o.permission !== 'string' || !['allow', 'deny'].includes(String(o.effect)))
      throw new ForbiddenException('Invalid permission override configuration');
    const expiresAt = o.expiresAt ? new Date(String(o.expiresAt)) : null;
    if (expiresAt && !Number.isFinite(expiresAt.getTime()))
      return o.effect === 'deny' ? [{ permission: o.permission, effect: 'deny' as const }] : [];
    return [{ permission: o.permission, effect: o.effect as 'allow' | 'deny', expiresAt }];
  });
}

/** Role keys for which an organization requires MFA, from `settings.security.mfaRequiredRoleKeys`. */
export function mfaRequiredRoleKeys(settings: unknown): string[] {
  const raw = jsonObject(jsonObject(settings).security).mfaRequiredRoleKeys;
  return Array.isArray(raw) ? raw.filter((k): k is string => typeof k === 'string') : [];
}

export async function resolveAuthorization(
  db: Store,
  membership: Membership,
  sessionId: string,
  facts: MfaFacts = { mfaEnabled: true, organizationSettings: {} },
): Promise<AuthContext> {
  if (membership.role && membership.role.organizationId !== membership.organizationId)
    throw new ForbiddenException('Invalid membership role');
  if (membership.status !== 'ACTIVE')
    throw new ForbiddenException('Your access to this organization is suspended');
  const modules = await db.organizationModule.findMany({
    where: { organizationId: membership.organizationId, enabled: true, module: { enabled: true } },
    include: { module: true },
  });
  // Deployment ceiling (OPERIX_MODULE_ALLOWLIST) applies on top of database enablement.
  const ceiling = config().moduleAllowlist;
  const enabledModules = modules
    .map((m) => m.module.key)
    .filter((key): key is ModuleKey => Object.values(MODULE).includes(key as ModuleKey))
    .filter((key) => !ceiling.length || ceiling.includes(key));
  // Platform control-plane grants are independent of tenant product modules,
  // but still require exact capabilities and honor explicit deny overrides.
  if (
    membership.role?.permissions.some((p) => p.startsWith('platform.')) &&
    (!ceiling.length || ceiling.includes(MODULE.PLATFORM))
  )
    enabledModules.push(MODULE.PLATFORM);
  const branches = await db.branch.findMany({
    where: { organizationId: membership.organizationId, id: { in: membership.branchIds } },
    select: { id: true },
  });
  if (branches.length !== new Set(membership.branchIds).size)
    throw new ForbiddenException('Invalid membership branches');
  const dataScope = scopes.has(membership.role?.dataScope ?? '')
    ? (membership.role!.dataScope as DataScope)
    : 'self';
  for (const [field, module] of [
    ['customerId', 'customers'],
    ['employeeId', 'employees'],
  ] as const) {
    if (
      membership[field] &&
      !(await db.businessRecord.findFirst({
        where: {
          id: membership[field]!,
          organizationId: membership.organizationId,
          module,
          archivedAt: null,
        },
      }))
    )
      throw new ForbiddenException('Invalid membership identity');
  }
  const ability = buildAbility({
    rolePermissions: membership.role?.permissions ?? [],
    overrides: parseOverrides(membership.permissionOverrides),
    enabledModules,
    dataScope,
    branchIds: membership.branchIds,
    customerId: membership.customerId,
    employeeId: membership.employeeId,
  });
  return {
    userId: membership.userId,
    organizationId: membership.organizationId,
    sessionId,
    permissions: ability.toJSON(),
    enabledModules,
    branchIds: membership.branchIds,
    dataScope,
    customerId: membership.customerId,
    employeeId: membership.employeeId,
    roleKey: membership.role?.systemKey ?? null,
    isOwner: membership.isOwner,
    mfaEnrollmentRequired:
      !facts.mfaEnabled &&
      !!membership.role?.systemKey &&
      mfaRequiredRoleKeys(facts.organizationSettings).includes(membership.role.systemKey),
  };
}

export function can(ctx: AuthContext, permission: string) {
  return ctx.permissions.includes(permission);
}
export function requirePermissions(ctx: AuthContext, ...permissions: string[]) {
  if (!permissions.every((p) => can(ctx, p)))
    throw new ForbiddenException('Insufficient permissions');
}
export function branchWhere(ctx: AuthContext): { branchId?: { in: string[] } } {
  return ctx.branchIds.length || ctx.dataScope === 'branch'
    ? { branchId: { in: ctx.branchIds } }
    : {};
}
export function tenantWhere(ctx: AuthContext) {
  return { organizationId: ctx.organizationId, ...branchWhere(ctx) };
}
export function isOrganizationWide(ctx: AuthContext) {
  return ctx.dataScope === 'all' && ctx.branchIds.length === 0;
}
export function membershipWhere(ctx: AuthContext): Prisma.OrganizationUserWhereInput {
  return {
    organizationId: ctx.organizationId,
    ...(['self', 'assigned', 'customer'].includes(ctx.dataScope)
      ? { userId: ctx.userId }
      : ctx.branchIds.length || ctx.dataScope === 'branch'
        ? { branchIds: { hasSome: ctx.branchIds } }
        : {}),
  };
}
export function requireOrganizationWide(ctx: AuthContext) {
  if (!isOrganizationWide(ctx)) throw new ForbiddenException('Organization-wide scope required');
}

const ASSIGNMENT_FIELDS: Record<string, { one?: string[]; many?: string[] }> = {
  customers: { one: ['salespersonUserId', 'projectManagerUserId', 'assignedToUserId'] },
  leads: { one: ['salespersonUserId', 'assignedToUserId'] },
  projects: { one: ['projectManagerUserId'], many: ['memberUserIds'] },
  tasks: { one: ['assigneeUserId'] },
  'work-orders': { many: ['assigneeUserIds'] },
  'production-jobs': { one: ['assigneeUserId'], many: ['assigneeUserIds'] },
  assets: { one: ['assigneeUserId'] },
};
export function recordWhere(ctx: AuthContext, module: string): Prisma.BusinessRecordWhereInput {
  const base: Prisma.BusinessRecordWhereInput = { ...tenantWhere(ctx), module, archivedAt: null };
  if (module === 'notifications')
    return { ...base, data: { path: ['recipientUserId'], equals: ctx.userId } };
  if (ctx.dataScope === 'customer')
    return {
      ...base,
      ...(ctx.customerId
        ? module === 'customers'
          ? { id: ctx.customerId }
          : { data: { path: ['customerId'], equals: ctx.customerId } }
        : none),
    };
  if (ctx.dataScope === 'all' || ctx.dataScope === 'branch') return base;
  // "View every project, not only assigned ones" — still within the branch ceiling.
  if (module === 'projects' && can(ctx, 'projects.view_all')) return base;
  if (module === 'employees')
    return { ...base, ...(ctx.employeeId ? { id: ctx.employeeId } : none) };
  if (module === 'attendance') return { ...base, createdBy: ctx.userId };
  const fields = ASSIGNMENT_FIELDS[module];
  const OR: Prisma.BusinessRecordWhereInput[] = [{ createdBy: ctx.userId }];
  for (const key of fields?.one ?? []) OR.push({ data: { path: [key], equals: ctx.userId } });
  for (const key of fields?.many ?? [])
    OR.push({ data: { path: [key], array_contains: [ctx.userId] } });
  return { ...base, OR };
}

export function financialWhere(
  ctx: AuthContext,
): Prisma.InvoiceWhereInput & Prisma.PaymentWhereInput {
  const base = tenantWhere(ctx);
  if (ctx.dataScope === 'customer')
    return { ...base, ...(ctx.customerId ? { customerId: ctx.customerId } : none) };
  if (ctx.dataScope === 'self' || ctx.dataScope === 'assigned')
    return { ...base, createdBy: ctx.userId };
  return base;
}
export function inventoryWhere(ctx: AuthContext): Prisma.InventoryItemWhereInput {
  // No item-assignment model exists; do not expand a self/assigned grant.
  return {
    ...tenantWhere(ctx),
    ...(['self', 'assigned', 'customer'].includes(ctx.dataScope) ? none : {}),
  };
}

export async function validateBranch(db: Store, ctx: AuthContext, branchId?: string | null) {
  if (
    branchId &&
    !(await db.branch.findFirst({ where: { id: branchId, organizationId: ctx.organizationId } }))
  )
    throw new BadRequestException('Invalid branch for this organization');
  assertBranch(ctx, branchId);
}
export function assertBranch(ctx: AuthContext, branchId?: string | null) {
  const permitted = branchWhere(ctx).branchId?.in;
  if (permitted && (!branchId || !permitted.includes(branchId)))
    throw new ForbiddenException('Branch is outside your access scope');
}
export async function requireRecordReference(
  db: Store,
  ctx: AuthContext,
  module: string,
  id: string,
) {
  const record = await db.businessRecord.findFirst({
    where: { AND: [recordWhere(ctx, module), { id }] },
  });
  if (!record) throw new BadRequestException('Reference is invalid or outside your access scope');
  return record;
}

const RECORD_REFERENCES: Record<string, string> = {
  customerId: 'customers',
  projectId: 'projects',
  contractId: 'contracts',
  quotationId: 'quotations',
  serviceId: 'services',
  supplierId: 'suppliers',
  workOrderId: 'work-orders',
  employeeId: 'employees',
  managerEmployeeId: 'employees',
  purchaseOrderId: 'purchase-orders',
  documentId: 'documents',
  siteId: 'geofences',
};
const USER_REFERENCES = new Set([
  'assigneeUserId',
  'assignedToUserId',
  'salespersonUserId',
  'projectManagerUserId',
  'recipientUserId',
  'userId',
]);
const USER_ARRAYS = new Set(['memberUserIds', 'assigneeUserIds']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function validateRecordData(
  db: Store,
  ctx: AuthContext,
  module: string,
  data: Record<string, unknown>,
  branchId?: string | null,
) {
  for (const [key, value] of Object.entries(data)) {
    if (value == null) continue;
    if (RECORD_REFERENCES[key]) {
      if (typeof value !== 'string' || !uuid.test(value))
        throw new BadRequestException(`Invalid ${key}`);
      await requireRecordReference(db, ctx, RECORD_REFERENCES[key], value);
    } else if (USER_REFERENCES.has(key) || USER_ARRAYS.has(key)) {
      const ids = USER_ARRAYS.has(key) ? value : [value];
      if (
        !Array.isArray(ids) ||
        ids.length > 200 ||
        ids.some((x) => typeof x !== 'string' || !uuid.test(x))
      )
        throw new BadRequestException(`Invalid ${key}`);
      const members = await db.organizationUser.findMany({
        where: { organizationId: ctx.organizationId, userId: { in: ids as string[] } },
      });
      if (
        members.length !== new Set(ids).size ||
        members.some((m) => branchId && m.branchIds.length && !m.branchIds.includes(branchId))
      )
        throw new BadRequestException('User reference is outside this organization or branch');
    }
  }
  if (module === 'notifications' && typeof data.recipientUserId !== 'string')
    throw new BadRequestException('A notification requires one recipientUserId');
  if ('branchId' in data)
    throw new BadRequestException('Use the record branchId, not a JSON branch override');
}

// Safe projection, rather than a blacklist which can leak unknown legacy JSON.
const EMPLOYEE_PUBLIC = new Set([
  'firstName',
  'lastName',
  'employeeNumber',
  'email',
  'phone',
  'departmentId',
  'positionId',
  'branchId',
  'managerEmployeeId',
  'hireDate',
  'employmentType',
  'status',
  'userId',
]);
/**
 * Field-level sensitivity outside HR: these JSON fields are removed from
 * responses and rejected on writes unless the named capability is effective.
 */
export const SENSITIVE_FIELDS: Record<string, Record<string, string>> = {
  customers: {
    taxId: 'customers.view_financials',
    paymentTerms: 'customers.view_financials',
  },
  projects: { budget: 'projects.view_budget' },
};
function hiddenFields(ctx: AuthContext, module: string) {
  return Object.entries(SENSITIVE_FIELDS[module] ?? {})
    .filter(([, permission]) => !can(ctx, permission))
    .map(([field]) => field);
}
export function validateSensitiveWrite(
  ctx: AuthContext,
  module: string,
  data: Record<string, unknown>,
) {
  const blocked = hiddenFields(ctx, module).filter((field) => field in data);
  if (blocked.length)
    throw new ForbiddenException(`You are not permitted to set ${blocked.join(', ')}`);
}

export function projectRecord<T extends { module: string; data: unknown }>(
  ctx: AuthContext,
  record: T,
): T {
  const hidden = hiddenFields(ctx, record.module);
  if (hidden.length)
    return {
      ...record,
      data: Object.fromEntries(
        Object.entries(jsonObject(record.data)).filter(([key]) => !hidden.includes(key)),
      ),
    };
  if (record.module !== 'employees' || can(ctx, 'employees.view_sensitive')) return record;
  return {
    ...record,
    data: Object.fromEntries(
      Object.entries(jsonObject(record.data)).filter(
        ([key, value]) =>
          EMPLOYEE_PUBLIC.has(key) &&
          (value === null || ['string', 'number', 'boolean'].includes(typeof value)),
      ),
    ),
  };
}
export function validateEmployeeWrite(
  ctx: AuthContext,
  module: string,
  data: Record<string, unknown>,
) {
  if (
    module === 'employees' &&
    !can(ctx, 'employees.view_sensitive') &&
    Object.keys(data).some((key) => !EMPLOYEE_PUBLIC.has(key))
  )
    throw new ForbiddenException('Sensitive employee fields require employees.view_sensitive');
}
