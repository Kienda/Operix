import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@operix/database';
import { DatabaseService } from '../platform/database.module';
import type { AuthContext } from '../security/request-context';
import { mfa } from './mfa.util';
import { resolveAuthorization } from '../security/authorization';
import { serializable } from '../platform/transaction';
import { config } from '../platform/config';
import { actionMail, MailService } from '../platform/mail.service';
import { logEvent } from '../platform/logger';
import { assertDelegable, OWNER_ROLE_KEYS } from '../platform/delegation';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Equalizes response time for unknown emails (argon2 verify of a throwaway hash).
const DUMMY_HASH = argon2.hash(randomBytes(16).toString('hex'));

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
  ) {}

  async login(
    input: { email: string; password: string; organizationSlug?: string; mfaCode?: string },
    userAgent?: string,
    ipAddress?: string,
  ) {
    const user = await this.db.user.findUnique({ where: { email: input.email.toLowerCase() } });
    const passwordOk = await argon2.verify(
      user?.passwordHash ?? (await DUMMY_HASH),
      input.password,
    );
    if (!user || user.status !== 'ACTIVE' || !passwordOk) {
      logEvent('warn', 'login_failed', { reason: 'credentials', ip: ipAddress });
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.mfaEnabled) {
      if (!input.mfaCode)
        throw new UnauthorizedException({ message: 'MFA code required', code: 'MFA_REQUIRED' });
      if (!user.mfaSecret || !(await mfa.check(input.mfaCode, user.mfaSecret))) {
        logEvent('warn', 'login_failed', { reason: 'mfa', userId: user.id, ip: ipAddress });
        throw new UnauthorizedException({ message: 'Invalid MFA code', code: 'MFA_INVALID' });
      }
    }
    // Credentials (and MFA) are proven before anything below reveals which
    // workspaces exist for this account.
    const memberships = await this.db.organizationUser.findMany({
      where: { userId: user.id, status: 'ACTIVE', organization: { status: 'ACTIVE' } },
      include: { role: true, organization: true },
    });
    if (memberships.length === 0) throw new UnauthorizedException('No organization access');

    let membership;
    if (input.organizationSlug) {
      membership = memberships.find((entry) => entry.organization.slug === input.organizationSlug);
      if (!membership) throw new UnauthorizedException('No organization access');
    } else if (memberships.length === 1) {
      membership = memberships[0];
    } else {
      throw new BadRequestException({
        message: 'Select the workspace to sign in to',
        code: 'WORKSPACE_SELECTION_REQUIRED',
        workspaces: memberships.map((entry) => ({
          name: entry.organization.name,
          slug: entry.organization.slug,
        })),
      });
    }
    const organization = membership.organization;
    const rawRefresh = randomBytes(48).toString('base64url');
    const session = await this.db.session.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        refreshTokenHash: await argon2.hash(rawRefresh),
        userAgent: userAgent?.slice(0, 300),
        ipAddress,
        expiresAt: new Date(Date.now() + config().sessionTtlDays * 86400000),
      },
    });
    await this.db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.db.auditLog.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        action: 'LOGIN',
        resource: 'session',
        resourceId: session.id,
        ipAddress,
      },
    });
    const accessToken = await this.jwt.signAsync({ userId: user.id, sessionId: session.id });
    const principal = await resolveAuthorization(this.db, membership, session.id, {
      mfaEnabled: user.mfaEnabled,
      organizationSettings: organization.settings,
    });
    return {
      accessToken,
      refreshToken: `${session.id}.${rawRefresh}`,
      expiresIn: 900,
      ...this.profile(user, membership, principal),
    };
  }

  private profile(
    user: { id: string; email: string; firstName: string; lastName: string; mfaEnabled: boolean },
    membership: Prisma.OrganizationUserGetPayload<{ include: { role: true; organization: true } }>,
    principal: AuthContext,
  ) {
    const organization = membership.organization;
    return {
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        defaultCurrency: organization.defaultCurrency,
        timezone: organization.timezone,
      },
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        mfaEnabled: user.mfaEnabled,
      },
      role: membership.role
        ? { id: membership.role.id, name: membership.role.name, key: membership.role.systemKey }
        : null,
      isOwner: membership.isOwner,
      dataScope: principal.dataScope,
      branchIds: principal.branchIds,
      enabledModules: principal.enabledModules,
      permissions: principal.permissions,
      mfaEnrollmentRequired: principal.mfaEnrollmentRequired,
    };
  }

  async refresh(token: string) {
    const [sessionId, secret] = token.split('.');
    const session =
      sessionId && /^[0-9a-f-]{36}$/i.test(sessionId)
        ? await this.db.session.findUnique({
            where: { id: sessionId },
            include: { user: true },
          })
        : null;
    if (
      !session ||
      !secret ||
      session.revokedAt ||
      session.expiresAt < new Date() ||
      session.user.status !== 'ACTIVE' ||
      !(await argon2.verify(session.refreshTokenHash, secret))
    )
      throw new UnauthorizedException('Invalid refresh token');
    const membership = session.organizationId
      ? await this.db.organizationUser.findUnique({
          where: {
            organizationId_userId: {
              organizationId: session.organizationId,
              userId: session.userId,
            },
          },
        })
      : null;
    if (!membership || membership.status !== 'ACTIVE')
      throw new UnauthorizedException('Invalid refresh token');
    const replacement = randomBytes(48).toString('base64url');
    // Compare-and-swap: two concurrent refreshes of one token cannot both rotate it.
    const rotated = await this.db.session.updateMany({
      where: { id: session.id, refreshTokenHash: session.refreshTokenHash, revokedAt: null },
      data: { refreshTokenHash: await argon2.hash(replacement) },
    });
    if (rotated.count !== 1) throw new UnauthorizedException('Invalid refresh token');
    return {
      accessToken: await this.jwt.signAsync({ userId: session.userId, sessionId: session.id }),
      refreshToken: `${session.id}.${replacement}`,
      expiresIn: 900,
    };
  }

  async logout(ctx: AuthContext) {
    await this.db.session.updateMany({
      where: { id: ctx.sessionId },
      data: { revokedAt: new Date() },
    });
    await this.db.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        action: 'LOGOUT',
        resource: 'session',
        resourceId: ctx.sessionId,
      },
    });
    return { success: true };
  }

  async me(ctx: AuthContext) {
    const membership = await this.db.organizationUser.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: ctx.organizationId, userId: ctx.userId } },
      include: { user: true, role: true, organization: true },
    });
    const branches = await this.db.branch.findMany({
      where: {
        organizationId: ctx.organizationId,
        isActive: true,
        ...(ctx.branchIds.length ? { id: { in: ctx.branchIds } } : {}),
      },
      select: { id: true, name: true, code: true, country: true, currency: true, timezone: true },
      orderBy: { name: 'asc' },
    });
    return { ...this.profile(membership.user, membership, ctx), branches };
  }

  // --------------------------------------------------------------------- MFA

  /** Fresh password/factor proof stages a replacement without disabling MFA. */
  async mfaEnroll(ctx: AuthContext, input: { password: string; code?: string }) {
    return serializable(this.db, async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.userId } });
      if (!(await argon2.verify(user.passwordHash, input.password)))
        throw new UnauthorizedException('Invalid password');
      if (
        user.mfaEnabled &&
        (!input.code || !user.mfaSecret || !(await mfa.check(input.code, user.mfaSecret)))
      )
        throw new UnauthorizedException('Current MFA code required');
      const secret = mfa.generateSecret();
      await tx.user.update({
        where: { id: ctx.userId },
        data: {
          pendingMfaSecret: secret,
          pendingMfaExpiresAt: new Date(Date.now() + 600000),
          pendingMfaSessionId: ctx.sessionId,
        },
      });
      const otpauthUrl = mfa.otpauthUrl(user.email, process.env.MFA_ISSUER ?? 'Operix', secret);
      return { secret, otpauthUrl };
    });
  }

  async mfaConfirm(ctx: AuthContext, code: string) {
    return serializable(this.db, async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.userId } });
      if (
        !user.pendingMfaSecret ||
        !user.pendingMfaExpiresAt ||
        user.pendingMfaExpiresAt <= new Date() ||
        user.pendingMfaSessionId !== ctx.sessionId ||
        !(await mfa.check(code, user.pendingMfaSecret))
      )
        throw new UnauthorizedException('Invalid or expired MFA enrollment');
      await tx.user.update({
        where: { id: ctx.userId },
        data: {
          mfaEnabled: true,
          mfaSecret: user.pendingMfaSecret,
          pendingMfaSecret: null,
          pendingMfaExpiresAt: null,
          pendingMfaSessionId: null,
        },
      });
      await tx.session.updateMany({
        where: { userId: ctx.userId, id: { not: ctx.sessionId }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'MFA_CONFIRMED',
          resource: 'user',
          resourceId: ctx.userId,
        },
      });
      return { success: true };
    });
  }

  async mfaDisable(ctx: AuthContext, password: string, code?: string) {
    if (ctx.roleKey) {
      const membership = await this.db.organizationUser.findUniqueOrThrow({
        where: {
          organizationId_userId: { organizationId: ctx.organizationId, userId: ctx.userId },
        },
        include: { organization: true },
      });
      const settings = membership.organization.settings as {
        security?: { mfaRequiredRoleKeys?: unknown };
      };
      const required = settings?.security?.mfaRequiredRoleKeys;
      if (Array.isArray(required) && required.includes(ctx.roleKey))
        throw new ForbiddenException('Your role requires MFA; it cannot be turned off');
    }
    return serializable(this.db, async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.userId } });
      if (!(await argon2.verify(user.passwordHash, password)))
        throw new UnauthorizedException('Invalid password');
      if (
        user.mfaEnabled &&
        (!code || !user.mfaSecret || !(await mfa.check(code, user.mfaSecret)))
      ) {
        throw new UnauthorizedException('Invalid MFA code');
      }
      await tx.user.update({
        where: { id: ctx.userId },
        data: {
          mfaEnabled: false,
          mfaSecret: null,
          pendingMfaSecret: null,
          pendingMfaExpiresAt: null,
          pendingMfaSessionId: null,
        },
      });
      await tx.session.updateMany({
        where: { userId: ctx.userId, id: { not: ctx.sessionId }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'MFA_DISABLED',
          resource: 'user',
          resourceId: ctx.userId,
        },
      });
      return { success: true };
    });
  }

  // ----------------------------------------------------------- password reset

  async forgotPassword(email: string) {
    const user = await this.db.user.findUnique({ where: { email: email.toLowerCase() } });
    // Always the same answer: this endpoint must not reveal whether an account exists.
    if (!user || user.status !== 'ACTIVE') return { success: true };
    const rawToken = randomBytes(32).toString('base64url');
    await this.db.$transaction([
      // Only the newest link works.
      this.db.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.db.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(rawToken),
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      }),
    ]);
    // The token travels in the URL fragment, so it never reaches server/proxy logs.
    const url = `${config().appUrl}/#/reset-password?token=${rawToken}`;
    try {
      await this.mail.send({
        to: user.email,
        subject: 'Reset your Operix password',
        category: 'password_reset',
        ...actionMail({
          heading: 'Reset your password',
          intro: `A password reset was requested for ${user.email}. The link expires in 60 minutes and works once.`,
          action: 'Choose a new password',
          url,
          footer: 'If you did not request this, ignore this email. Your password stays unchanged.',
        }),
      });
    } catch (error) {
      await this.db.passwordResetToken.updateMany({
        where: { tokenHash: hashToken(rawToken), usedAt: null },
        data: { usedAt: new Date() },
      });
      throw error;
    }
    return { success: true };
  }

  async resetPassword(rawToken: string, password: string) {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    return this.db.$transaction(async (tx) => {
      const token = await tx.passwordResetToken.findUnique({
        where: { tokenHash: hashToken(rawToken) },
      });
      // Atomic claim: concurrent submissions of one token cannot both succeed.
      const claimed = token
        ? await tx.passwordResetToken.updateMany({
            where: { id: token.id, usedAt: null, expiresAt: { gt: new Date() } },
            data: { usedAt: new Date() },
          })
        : { count: 0 };
      if (!token || claimed.count !== 1)
        throw new UnauthorizedException('Invalid or expired reset link');
      await tx.user.update({ where: { id: token.userId }, data: { passwordHash } });
      await tx.session.updateMany({
        where: { userId: token.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          userId: token.userId,
          action: 'PASSWORD_RESET',
          resource: 'user',
          resourceId: token.userId,
        },
      });
      return { success: true };
    });
  }

  // ------------------------------------------------------------- invitations

  async createInvitation(
    ctx: AuthContext,
    input: { email: string; roleId: string; branchIds?: string[] },
  ) {
    const organizationId = ctx.organizationId;
    const email = input.email.trim().toLowerCase();
    const branchIds = [...new Set(input.branchIds ?? [])];
    const rawToken = randomBytes(32).toString('base64url');
    const { invitation, organization, role } = await serializable(this.db, async (tx) => {
      const role = await tx.role.findFirst({ where: { id: input.roleId, organizationId } });
      if (!role) throw new BadRequestException('Role does not belong to this organization');
      await assertDelegable(tx, ctx, role, branchIds);
      if (
        await tx.organizationUser.findFirst({
          where: { organizationId, user: { email } },
        })
      )
        throw new BadRequestException('This person already has access to the organization');
      // A resend replaces the previous link instead of leaving several valid ones.
      await tx.invitation.updateMany({
        where: { organizationId, email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const invitation = await tx.invitation.create({
        data: {
          organizationId,
          email,
          tokenHash: hashToken(rawToken),
          roleId: role.id,
          branchIds,
          invitedBy: ctx.userId,
          expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId: ctx.userId,
          action: 'INVITATION_CREATED',
          resource: 'invitation',
          resourceId: invitation.id,
          after: { email, roleId: role.id, roleKey: role.systemKey, branchIds },
        },
      });
      const organization = await tx.organization.findUniqueOrThrow({
        where: { id: organizationId },
      });
      return { invitation, organization, role };
    });
    const inviteUrl = `${config().appUrl}/#/accept-invite?token=${rawToken}`;
    try {
      await this.mail.send({
        to: email,
        subject: `You're invited to ${organization.name} on Operix`,
        category: 'invitation',
        ...actionMail({
          heading: `Join ${organization.name} on Operix`,
          intro: `You have been invited as ${role.name}. Set your name and a password of at least 12 characters to activate your account. The link expires in 7 days and works once.`,
          action: 'Accept invitation',
          url: inviteUrl,
          footer: 'If you were not expecting this invitation, you can ignore this email.',
        }),
      });
    } catch (error) {
      await this.db.invitation.updateMany({
        where: { id: invitation.id, acceptedAt: null },
        data: { revokedAt: new Date() },
      });
      throw error;
    }
    return {
      id: invitation.id,
      email: invitation.email,
      expiresAt: invitation.expiresAt,
      delivered: true,
      // Bearer link exposure to the inviter is a deliberate non-production convenience.
      ...(config().inviteLinkInResponse ? { inviteUrl } : {}),
    };
  }

  async acceptInvitation(
    rawToken: string,
    input: { firstName: string; lastName: string; password: string },
  ) {
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    return serializable(this.db, async (tx) => {
      const invitation = await tx.invitation.findUnique({
        where: { tokenHash: hashToken(rawToken) },
      });
      if (
        !invitation ||
        invitation.acceptedAt ||
        invitation.revokedAt ||
        invitation.expiresAt < new Date()
      )
        throw new UnauthorizedException('This invitation is invalid, expired or already used');
      const [role, branchCount] = await Promise.all([
        tx.role.findFirst({
          where: { id: invitation.roleId, organizationId: invitation.organizationId },
        }),
        tx.branch.count({
          where: {
            organizationId: invitation.organizationId,
            id: { in: invitation.branchIds },
            isActive: true,
          },
        }),
      ]);
      if (!role || branchCount !== new Set(invitation.branchIds).size)
        throw new BadRequestException('Invitation has invalid organization references');
      const existing = await tx.user.findUnique({ where: { email: invitation.email } });
      if (existing) {
        // The email link proves mailbox control; the existing password proves account ownership.
        if (!(await argon2.verify(existing.passwordHash, input.password)))
          throw new BadRequestException({
            message: 'An Operix account already exists for this email. Enter its current password.',
            code: 'EXISTING_ACCOUNT_PASSWORD_REQUIRED',
          });
        if (existing.status !== 'ACTIVE') throw new ForbiddenException('This account is disabled');
      }
      const user =
        existing ??
        (await tx.user.create({
          data: {
            email: invitation.email,
            passwordHash,
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
          },
        }));
      const claimed = await tx.invitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count !== 1) throw new UnauthorizedException('This invitation was already used');
      const membership = await tx.organizationUser.create({
        data: {
          organizationId: invitation.organizationId,
          userId: user.id,
          roleId: invitation.roleId,
          branchIds: invitation.branchIds,
          // Only an owner can issue an owner-role invitation (see delegation.ts).
          isOwner: !!role.systemKey && OWNER_ROLE_KEYS.has(role.systemKey),
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: invitation.organizationId,
          userId: user.id,
          action: 'INVITATION_ACCEPTED',
          resource: 'membership',
          resourceId: membership.id,
          metadata: { invitationId: invitation.id, existingAccount: !!existing },
        },
      });
      return { id: user.id, email: user.email, existingAccount: !!existing };
    });
  }
}
