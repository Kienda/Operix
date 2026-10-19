import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { Prisma } from '@operix/database';
import { DatabaseService } from './database.module';
import type { AuthenticatedRequest, AuthContext } from '../security/request-context';
import { RequirePermissions } from '../security/permissions.decorator';
import { AuthService } from '../auth/auth.service';
import {
  can,
  isOrganizationWide,
  membershipWhere,
  requireOrganizationWide,
} from '../security/authorization';
import { serializable } from './transaction';
import {
  assertDelegable,
  assignableRoleKeys,
  canDelegateRole,
  OWNER_ROLE_KEYS,
} from './delegation';

const CURRENCIES = ['USD', 'EUR', 'GNF'];
const validTimezone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

class BranchDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsString() @Matches(/^[A-Z0-9-]{2,12}$/) code!: string;
  @IsString() @Matches(/^[A-Z]{2}$/) country!: string;
  @IsIn(CURRENCIES) currency!: string;
  @IsString() @MaxLength(64) timezone!: string;
}
class OrganizationDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;
  @IsOptional() @IsIn(CURRENCIES) defaultCurrency?: string;
}
class InviteUserDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsUUID() roleId!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID('4', { each: true }) branchIds?: string[];
}
class MembershipDto {
  @IsOptional() @IsUUID() roleId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID('4', { each: true }) branchIds?: string[];
}

const userSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  status: true,
  lastLoginAt: true,
  mfaEnabled: true,
} as const;

@Controller('organization')
export class AdminController {
  constructor(
    private readonly db: DatabaseService,
    private readonly auth: AuthService,
  ) {}

  @Get() get(@Req() r: AuthenticatedRequest) {
    return this.db.organization.findUnique({
      where: { id: r.auth.organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        defaultCurrency: true,
        timezone: true,
        branches: {
          where:
            r.auth.branchIds.length || r.auth.dataScope === 'branch'
              ? { id: { in: r.auth.branchIds } }
              : {},
          orderBy: { name: 'asc' },
        },
        enabledModules: {
          where: { enabled: true, module: { key: { in: r.auth.enabledModules } } },
          select: { module: { select: { key: true, name: true } } },
        },
      },
    });
  }

  @RequirePermissions('settings.manage') @Patch() async update(
    @Body() body: OrganizationDto,
    @Req() r: AuthenticatedRequest,
  ) {
    requireOrganizationWide(r.auth);
    if (body.timezone && !validTimezone(body.timezone))
      throw new BadRequestException('Unknown timezone');
    return serializable(this.db, async (tx) => {
      const before = await tx.organization.findUniqueOrThrow({
        where: { id: r.auth.organizationId },
      });
      const updated = await tx.organization.update({
        where: { id: r.auth.organizationId },
        data: body,
      });
      await this.audit(tx, r.auth, 'ORGANIZATION_UPDATED', 'organization', updated.id, {
        before: {
          name: before.name,
          timezone: before.timezone,
          defaultCurrency: before.defaultCurrency,
        },
        after: body,
      });
      return updated;
    });
  }

  @RequirePermissions('settings.manage') @Post('branches') branch(
    @Body() b: BranchDto,
    @Req() r: AuthenticatedRequest,
  ) {
    requireOrganizationWide(r.auth);
    if (!validTimezone(b.timezone)) throw new BadRequestException('Unknown timezone');
    return serializable(this.db, async (tx) => {
      const branch = await tx.branch.create({
        data: { ...b, organizationId: r.auth.organizationId },
      });
      await this.audit(tx, r.auth, 'BRANCH_CREATED', 'branch', branch.id, { after: b });
      return branch;
    });
  }

  @RequirePermissions('users.manage') @Get('users') async users(@Req() r: AuthenticatedRequest) {
    const members = await this.db.organizationUser.findMany({
      where: membershipWhere(r.auth),
      include: { user: { select: userSelect }, role: true },
      orderBy: { createdAt: 'asc' },
    });
    return members.map((m) => ({
      id: m.id,
      status: m.status,
      isOwner: m.isOwner,
      branchIds: m.branchIds,
      createdAt: m.createdAt,
      suspendedAt: m.suspendedAt,
      user: m.user,
      role: m.role
        ? { id: m.role.id, name: m.role.name, key: m.role.systemKey, dataScope: m.role.dataScope }
        : null,
    }));
  }

  /** Active colleagues the caller may assign work to (no email, no security fields). */
  @Get('directory') async directory(@Req() r: AuthenticatedRequest) {
    if (
      !['tasks.assign', 'projects.manage_members', 'customers.update', 'users.manage'].some((p) =>
        can(r.auth, p),
      )
    )
      throw new ForbiddenException('Insufficient permissions');
    const members = await this.db.organizationUser.findMany({
      where: {
        organizationId: r.auth.organizationId,
        status: 'ACTIVE',
        user: { status: 'ACTIVE' },
        ...(r.auth.branchIds.length
          ? { OR: [{ branchIds: { hasSome: r.auth.branchIds } }, { branchIds: { isEmpty: true } }] }
          : {}),
      },
      include: { user: { select: { id: true, firstName: true, lastName: true } }, role: true },
    });
    return members
      .map((m) => ({
        userId: m.user.id,
        name: `${m.user.firstName} ${m.user.lastName}`,
        role: m.role?.name ?? null,
        branchIds: m.branchIds,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Roles this caller can grant; the invitation endpoint re-checks the same rule. */
  @RequirePermissions('users.manage') @Get('assignable-roles') async assignableRoles(
    @Req() r: AuthenticatedRequest,
  ) {
    const [roles, organization] = await Promise.all([
      this.db.role.findMany({
        where: { organizationId: r.auth.organizationId },
        orderBy: { name: 'asc' },
      }),
      this.db.organization.findUniqueOrThrow({ where: { id: r.auth.organizationId } }),
    ]);
    const allowed = assignableRoleKeys(organization.settings);
    return roles
      .filter((role) => canDelegateRole(r.auth, role, allowed))
      .map((role) => ({
        id: role.id,
        name: role.name,
        key: role.systemKey,
        description: role.description,
        dataScope: role.dataScope,
      }));
  }

  @RequirePermissions('roles.manage') @Get('roles') roles(@Req() r: AuthenticatedRequest) {
    return this.db.role.findMany({ where: { organizationId: r.auth.organizationId } });
  }

  @RequirePermissions('users.manage') @Patch('users/:membershipId') updateMember(
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() body: MembershipDto,
    @Req() r: AuthenticatedRequest,
  ) {
    if (!body.roleId && !body.branchIds) throw new BadRequestException('Nothing to change');
    return serializable(this.db, async (tx) => {
      const member = await this.member(tx, r.auth, membershipId);
      const roleId = body.roleId ?? member.roleId;
      const role = roleId
        ? await tx.role.findFirst({ where: { id: roleId, organizationId: r.auth.organizationId } })
        : null;
      if (!role) throw new BadRequestException('Role does not belong to this organization');
      const branchIds = [...new Set(body.branchIds ?? member.branchIds)];
      // Both the current and the new access must be within the caller's authority.
      if (member.role) await assertDelegable(tx, r.auth, member.role, member.branchIds);
      await assertDelegable(tx, r.auth, role, branchIds);
      if (member.isOwner && !(role.systemKey && OWNER_ROLE_KEYS.has(role.systemKey)))
        throw new BadRequestException('Transfer ownership before changing an owner role');
      const updated = await tx.organizationUser.update({
        where: { id: member.id },
        data: { roleId: role.id, branchIds },
      });
      await this.audit(tx, r.auth, 'MEMBERSHIP_UPDATED', 'membership', member.id, {
        before: { roleId: member.roleId, branchIds: member.branchIds },
        after: { roleId: role.id, branchIds },
      });
      return { id: updated.id, roleId: updated.roleId, branchIds: updated.branchIds };
    });
  }

  @RequirePermissions('users.manage') @Post('users/:membershipId/suspend') suspend(
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Req() r: AuthenticatedRequest,
  ) {
    return serializable(this.db, async (tx) => {
      const member = await this.member(tx, r.auth, membershipId);
      if (member.isOwner) throw new BadRequestException('An owner cannot be suspended');
      if (member.role) await assertDelegable(tx, r.auth, member.role, member.branchIds);
      if (member.status === 'SUSPENDED') return { id: member.id, status: member.status };
      const updated = await tx.organizationUser.update({
        where: { id: member.id },
        data: { status: 'SUSPENDED', suspendedAt: new Date(), suspendedBy: r.auth.userId },
      });
      // Access ends immediately: every session in this organization is revoked.
      const revoked = await tx.session.updateMany({
        where: { userId: member.userId, organizationId: r.auth.organizationId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit(tx, r.auth, 'MEMBERSHIP_SUSPENDED', 'membership', member.id, {
        metadata: { sessionsRevoked: revoked.count },
      });
      return { id: updated.id, status: updated.status };
    });
  }

  @RequirePermissions('users.manage') @Post('users/:membershipId/reactivate') reactivate(
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Req() r: AuthenticatedRequest,
  ) {
    return serializable(this.db, async (tx) => {
      const member = await this.member(tx, r.auth, membershipId);
      if (member.role) await assertDelegable(tx, r.auth, member.role, member.branchIds);
      if (member.status === 'ACTIVE') return { id: member.id, status: member.status };
      const updated = await tx.organizationUser.update({
        where: { id: member.id },
        data: { status: 'ACTIVE', suspendedAt: null, suspendedBy: null },
      });
      await this.audit(tx, r.auth, 'MEMBERSHIP_REACTIVATED', 'membership', member.id, {});
      return { id: updated.id, status: updated.status };
    });
  }

  @RequirePermissions('audit.view') @Get('audit') audit_(@Req() r: AuthenticatedRequest) {
    return this.db.auditLog.findMany({
      where: {
        organizationId: r.auth.organizationId,
        ...(isOrganizationWide(r.auth) ? {} : { userId: r.auth.userId }),
      },
      select: {
        id: true,
        action: true,
        resource: true,
        resourceId: true,
        userId: true,
        createdAt: true,
      },
      take: 100,
      orderBy: { createdAt: 'desc' },
    });
  }

  @RequirePermissions('users.manage') @Post('invitations') invite(
    @Body() b: InviteUserDto,
    @Req() r: AuthenticatedRequest,
  ) {
    return this.auth.createInvitation(r.auth, b);
  }

  @RequirePermissions('users.manage') @Get('invitations') async invitations(
    @Req() r: AuthenticatedRequest,
  ) {
    const rows = await this.db.invitation.findMany({
      where: {
        organizationId: r.auth.organizationId,
        acceptedAt: null,
        revokedAt: null,
        ...(isOrganizationWide(r.auth) ? {} : { invitedBy: r.auth.userId }),
      },
      // Never return token hashes.
      select: {
        id: true,
        email: true,
        branchIds: true,
        expiresAt: true,
        createdAt: true,
        invitedBy: true,
        role: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const now = new Date();
    return rows.map((row) => ({ ...row, expired: row.expiresAt <= now }));
  }

  @RequirePermissions('users.manage') @Delete('invitations/:id') revokeInvitation(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() r: AuthenticatedRequest,
  ) {
    return serializable(this.db, async (tx) => {
      const invitation = await tx.invitation.findFirst({
        where: {
          id,
          organizationId: r.auth.organizationId,
          ...(isOrganizationWide(r.auth) ? {} : { invitedBy: r.auth.userId }),
        },
      });
      if (!invitation) throw new NotFoundException('Invitation not found');
      if (invitation.acceptedAt)
        throw new BadRequestException('This invitation was already accepted');
      if (!invitation.revokedAt) {
        await tx.invitation.update({ where: { id }, data: { revokedAt: new Date() } });
        await this.audit(tx, r.auth, 'INVITATION_REVOKED', 'invitation', id, {});
      }
      return { id, revoked: true };
    });
  }

  private async member(tx: Prisma.TransactionClient, ctx: AuthContext, membershipId: string) {
    const member = await tx.organizationUser.findFirst({
      where: { AND: [membershipWhere(ctx), { id: membershipId }] },
      include: { role: true },
    });
    if (!member) throw new NotFoundException('Member not found');
    if (member.userId === ctx.userId)
      throw new BadRequestException('You cannot change your own access');
    return member;
  }

  private audit(
    tx: Prisma.TransactionClient,
    ctx: AuthContext,
    action: string,
    resource: string,
    resourceId: string,
    detail: { before?: unknown; after?: unknown; metadata?: unknown },
  ) {
    return tx.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        action,
        resource,
        resourceId,
        before: (detail.before ?? undefined) as Prisma.InputJsonValue | undefined,
        after: (detail.after ?? undefined) as Prisma.InputJsonValue | undefined,
        metadata: (detail.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}
