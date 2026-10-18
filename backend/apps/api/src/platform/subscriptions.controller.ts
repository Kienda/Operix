import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { DatabaseService } from './database.module';
import { RequirePermissions } from '../security/permissions.decorator';
import type { AuthenticatedRequest } from '../security/request-context';
import { calculateSubscriptionPrice } from './subscription.util';

class PlanDto {
  @IsString() key!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsString() currency!: string;
  @IsNumber() @Min(0) sixMonthPrice!: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) twentyFourMonthDiscount?: number;
}
class SubscriptionDto {
  @IsUUID() organizationId!: string;
  @IsUUID() planId!: string;
  @IsIn([6, 24]) periodMonths!: 6 | 24;
  @IsOptional() @IsString() paymentMethod?: string;
  @IsOptional() @IsString() paymentReference?: string;
  @IsOptional() @IsNumber() @Min(0) amountReceived?: number;
  @IsOptional() @IsString() paymentNotes?: string;
}
class TransitionDto {
  @IsIn(['ACTIVATE', 'EXTEND', 'SUSPEND', 'REACTIVATE', 'CANCEL']) action!: string;
  @IsOptional() @IsNumber() @IsIn([6, 24]) periodMonths?: 6 | 24;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() paymentMethod?: string;
  @IsOptional() @IsString() paymentReference?: string;
  @IsOptional() @IsNumber() @Min(0) amountReceived?: number;
}

@Controller('platform')
export class SubscriptionsController {
  constructor(private readonly db: DatabaseService) {}

  @RequirePermissions('platform.plans.manage')
  @Get('plans')
  plans() { return this.db.subscriptionPlan.findMany({ orderBy: { name: 'asc' } }); }

  @RequirePermissions('platform.plans.manage')
  @Post('plans')
  plan(@Body() body: PlanDto) {
    return this.db.subscriptionPlan.upsert({
      where: { key: body.key },
      update: body,
      create: { ...body, twentyFourMonthDiscount: body.twentyFourMonthDiscount ?? 10 },
    });
  }

  @RequirePermissions('platform.subscriptions.manage')
  @Get('subscriptions')
  subscriptions() {
    return this.db.subscription.findMany({ include: { organization: true, plan: true }, orderBy: { createdAt: 'desc' } });
  }

  @RequirePermissions('platform.subscriptions.manage')
  @Post('subscriptions')
  async create(@Body() body: SubscriptionDto, @Req() req: AuthenticatedRequest) {
    const plan = await this.db.subscriptionPlan.findUniqueOrThrow({ where: { id: body.planId } });
    const { basePrice, discountPercent: discount, effectivePrice } = calculateSubscriptionPrice(Number(plan.sixMonthPrice), body.periodMonths, Number(plan.twentyFourMonthDiscount));
    return this.db.$transaction(async (tx) => {
      const subscription = await tx.subscription.create({ data: {
        ...body, basePrice, discountPercent: discount, effectivePrice, currency: plan.currency,
        status: body.amountReceived ? 'PENDING_VERIFICATION' : 'AWAITING_PAYMENT',
      }});
      await tx.subscriptionHistory.create({ data: {
        organizationId: body.organizationId, subscriptionId: subscription.id, actorId: req.auth.userId,
        action: 'CREATED', toStatus: subscription.status, details: { periodMonths: body.periodMonths, effectivePrice },
      }});
      await tx.auditLog.create({ data: { organizationId: body.organizationId, userId: req.auth.userId, action: 'subscription.created', resource: 'subscription', resourceId: subscription.id, after: subscription } });
      return subscription;
    });
  }

  @RequirePermissions('platform.subscriptions.manage')
  @Patch('subscriptions/:id')
  async transition(@Param('id') id: string, @Body() body: TransitionDto, @Req() req: AuthenticatedRequest) {
    const current = await this.db.subscription.findUniqueOrThrow({ where: { id }, include: { plan: true } });
    const now = new Date();
    let status = current.status;
    let startsAt = current.startsAt;
    let endsAt = current.endsAt;
    if (body.action === 'ACTIVATE' || body.action === 'REACTIVATE') {
      status = 'ACTIVE'; startsAt ??= now;
      const months = body.periodMonths ?? current.periodMonths;
      endsAt = new Date(body.action === 'REACTIVATE' || !endsAt ? now : endsAt);
      endsAt.setUTCMonth(endsAt.getUTCMonth() + months);
    } else if (body.action === 'EXTEND') {
      if (!endsAt) throw new BadRequestException('Activate the subscription before extending it');
      endsAt = new Date(endsAt); endsAt.setUTCMonth(endsAt.getUTCMonth() + (body.periodMonths ?? current.periodMonths)); status = 'ACTIVE';
    } else if (body.action === 'SUSPEND') status = 'SUSPENDED';
    else if (body.action === 'CANCEL') status = 'CANCELLED';
    const graceEndsAt = endsAt ? new Date(endsAt.getTime() + 14 * 86400000) : current.graceEndsAt;
    return this.db.$transaction(async (tx) => {
      const updated = await tx.subscription.update({ where: { id }, data: {
        status, startsAt, endsAt, graceEndsAt,
        paymentMethod: body.paymentMethod ?? current.paymentMethod,
        paymentReference: body.paymentReference ?? current.paymentReference,
        amountReceived: body.amountReceived ?? current.amountReceived,
        approvedBy: ['ACTIVATE','EXTEND','REACTIVATE'].includes(body.action) ? req.auth.userId : current.approvedBy,
        approvedAt: ['ACTIVATE','EXTEND','REACTIVATE'].includes(body.action) ? now : current.approvedAt,
      }});
      const details = { reason: body.reason, endsAt, paymentReference: body.paymentReference };
      await tx.subscriptionHistory.create({ data: { organizationId: current.organizationId, subscriptionId: id, actorId: req.auth.userId, action: body.action, fromStatus: current.status, toStatus: status, details } });
      await tx.auditLog.create({ data: { organizationId: current.organizationId, userId: req.auth.userId, action: `subscription.${body.action.toLowerCase()}`, resource: 'subscription', resourceId: id, before: current, after: updated, metadata: details } });
      return updated;
    });
  }

  @RequirePermissions('platform.subscriptions.manage')
  @Get('subscriptions/:id/history')
  history(@Param('id') id: string) { return this.db.subscriptionHistory.findMany({ where: { subscriptionId: id }, orderBy: { createdAt: 'desc' } }); }
}
