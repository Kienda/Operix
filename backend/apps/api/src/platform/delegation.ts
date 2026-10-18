import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma, type Role } from '@operix/database';
import { moduleOfPermission } from '@operix/permissions';
import type { AuthContext } from '../security/request-context';
import { jsonObject } from '../security/authorization';

const SCOPE_RANK: Record<string, number> = { customer: 0, self: 1, assigned: 2, branch: 3, all: 4 };
export const OWNER_ROLE_KEYS = new Set(['company_owner', 'ght_owner']);

/** Role keys the organization allows to be assigned (settings.access.assignableRoleKeys). */
export function assignableRoleKeys(settings: unknown): string[] | null {
  const keys = jsonObject(jsonObject(settings).access).assignableRoleKeys;
  return Array.isArray(keys) ? keys.filter((k): k is string => typeof k === 'string') : null;
}

/** Whether `ctx` may grant `role`, ignoring branches. Used to list assignable roles. */
export function canDelegateRole(ctx: AuthContext, role: Role, allowedKeys: string[] | null) {
  if (allowedKeys && !(role.systemKey && allowedKeys.includes(role.systemKey))) return false;
  if (role.systemKey && OWNER_ROLE_KEYS.has(role.systemKey) && !ctx.isOwner) return false;
  if ((SCOPE_RANK[role.dataScope] ?? 99) > (SCOPE_RANK[ctx.dataScope] ?? -1)) return false;
  // Capabilities of disabled modules are inert for the grantee as well, so they
  // are compared only within the modules this organization currently enables.
  return role.permissions
    .filter((p) => {
      const module = moduleOfPermission(p);
      return module ? ctx.enabledModules.includes(module) : true;
    })
    .every((p) => ctx.permissions.includes(p));
}

/**
 * Delegation ceiling for invitations and role/branch changes: nobody can grant
 * a capability, scope or branch they do not hold, and only owners create owners.
 */
export async function assertDelegable(
  db: Prisma.TransactionClient,
  ctx: AuthContext,
  role: Role,
  branchIds: string[],
) {
  const organization = await db.organization.findUniqueOrThrow({
    where: { id: ctx.organizationId },
  });
  const allowedKeys = assignableRoleKeys(organization.settings);
  if (allowedKeys && !(role.systemKey && allowedKeys.includes(role.systemKey)))
    throw new BadRequestException('This role is not available in this organization');
  if (!canDelegateRole(ctx, role, allowedKeys))
    throw new ForbiddenException('You cannot grant a role with more access than your own');
  if ((ctx.branchIds.length || role.dataScope === 'branch') && !branchIds.length)
    throw new BadRequestException('Select at least one branch for this person');
  if (branchIds.length) {
    const branches = await db.branch.findMany({
      where: { organizationId: ctx.organizationId, id: { in: branchIds }, isActive: true },
      select: { id: true },
    });
    if (branches.length !== branchIds.length)
      throw new BadRequestException('Invalid branch for this organization');
    if (ctx.branchIds.length && branchIds.some((id) => !ctx.branchIds.includes(id)))
      throw new ForbiddenException('Branch is outside your access scope');
  }
}
