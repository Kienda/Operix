import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { DatabaseService } from '../platform/database.module';
import { ACCOUNT_SECURITY, IS_PUBLIC } from './public.decorator';
import { REQUIRED_PERMISSIONS } from './permissions.decorator';
import type { AuthenticatedRequest, AuthContext } from './request-context';
import { requirePermissions, resolveAuthorization } from './authorization';
import { isUUID } from 'class-validator';

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly db: DatabaseService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const accountSecurity = !!this.reflector.getAllAndOverride<boolean>(ACCOUNT_SECURITY, targets);
    const req = context.switchToHttp().getRequest<Request>();
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new UnauthorizedException('Bearer token required');
    let payload: Pick<AuthContext, 'userId' | 'sessionId'>;
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    const organizationId = String(req.headers['x-organization-id'] ?? '');
    if (!organizationId) throw new UnauthorizedException('x-organization-id is required');
    if (!isUUID(organizationId) || !isUUID(payload.userId) || !isUUID(payload.sessionId))
      throw new UnauthorizedException('Invalid authentication context');
    const [membership, session] = await Promise.all([
      this.db.organizationUser.findUnique({
        where: { organizationId_userId: { organizationId, userId: payload.userId } },
        include: { role: true, user: true, organization: true },
      }),
      this.db.session.findUnique({ where: { id: payload.sessionId } }),
    ]);
    if (!membership) throw new ForbiddenException('User does not belong to this organization');
    if (membership.user.status !== 'ACTIVE')
      throw new ForbiddenException('User account is disabled');
    if (
      !session ||
      session.userId !== payload.userId ||
      session.organizationId !== organizationId ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    )
      throw new UnauthorizedException('Session is no longer active');
    const principal = await resolveAuthorization(this.db, membership, session.id, {
      mfaEnabled: membership.user.mfaEnabled,
      organizationSettings: membership.organization.settings,
    });
    const permissions = principal.permissions;
    const isPlatformAdmin = permissions.some((permission) => permission.startsWith('platform.'));
    if (membership.organization.status === 'SUSPENDED' && !isPlatformAdmin && !accountSecurity)
      throw new ForbiddenException('Workspace is suspended');
    if (!isPlatformAdmin && !accountSecurity) {
      const subscription = await this.db.subscription.findFirst({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
      });
      if (subscription) {
        const expiredByDate = subscription.endsAt != null && subscription.endsAt <= new Date();
        const restricted =
          expiredByDate || ['EXPIRED', 'SUSPENDED', 'CANCELLED'].includes(subscription.status);
        if (restricted && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
          throw new ForbiddenException('Subscription is restricted; workspace access is read-only');
        }
      }
    }
    if (principal.mfaEnrollmentRequired && !accountSecurity)
      throw new ForbiddenException({
        message: 'Your role requires multi-factor authentication. Set it up to continue.',
        code: 'MFA_ENROLLMENT_REQUIRED',
      });
    (req as AuthenticatedRequest).auth = principal;
    const required =
      this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, targets) ?? [];
    requirePermissions(principal, ...required);
    return true;
  }
}
