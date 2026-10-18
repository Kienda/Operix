import {
  BadRequestException,
  Body,
  Controller,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Prisma, type RecordStatus } from '@operix/database';
import { DatabaseService } from '../platform/database.module';
import type { AuthenticatedRequest, AuthContext } from '../security/request-context';
import { RequirePermissions } from '../security/permissions.decorator';
import { jsonObject, projectRecord, recordWhere, validateBranch } from '../security/authorization';
import { serializable } from '../platform/transaction';
import { nextNumber } from '../platform/numbering';
import { decimal, money } from './decimal';

const CURRENCIES = ['USD', 'EUR', 'GNF'];

class QuotationItemDto {
  @IsString() @MinLength(1) @MaxLength(300) description!: string;
  /** Decimal string, up to 4 fractional digits, > 0. */
  @IsString() @Matches(/^\d{1,10}(\.\d{1,4})?$/) quantity!: string;
  /** Decimal string in the quotation currency's precision, ≥ 0. */
  @IsString() @Matches(/^\d{1,14}(\.\d{1,2})?$/) unitPrice!: string;
}
class QuotationDto {
  @IsUUID() customerId!: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsIn(CURRENCIES) currency!: string;
  /** Percent, e.g. "18" or "7.5". */
  @IsString() @Matches(/^\d{1,3}(\.\d{1,2})?$/) taxRate!: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) validUntil?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => QuotationItemDto)
  items!: QuotationItemDto[];
}
class ReasonDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

const round = (value: Prisma.Decimal, currency: string) =>
  value.toDecimalPlaces(currency === 'GNF' ? 0 : 2, Prisma.Decimal.ROUND_HALF_UP);

/** Authoritative totals: computed here from validated lines, never accepted from the client. */
export function priceQuotation(input: Pick<QuotationDto, 'currency' | 'taxRate' | 'items'>) {
  const rate = decimal(input.taxRate, 2);
  if (rate.greaterThan(100)) throw new BadRequestException('taxRate must be between 0 and 100');
  const items = input.items.map((item) => {
    const quantity = decimal(item.quantity, 4, true);
    const unitPrice = money(item.unitPrice, input.currency);
    const lineTotal = round(quantity.mul(unitPrice), input.currency);
    return {
      description: item.description.trim(),
      quantity: quantity.toFixed(),
      unitPrice: unitPrice.toFixed(),
      lineTotal: lineTotal.toFixed(),
    };
  });
  const subtotal = items.reduce((sum, i) => sum.add(i.lineTotal), new Prisma.Decimal(0));
  const tax = round(subtotal.mul(rate).div(100), input.currency);
  const total = subtotal.add(tax);
  if (total.greaterThan('999999999999.99'))
    throw new BadRequestException('Quotation total is too large');
  return {
    items,
    taxRate: rate.toFixed(),
    subtotal: subtotal.toFixed(),
    tax: tax.toFixed(),
    total: total.toFixed(),
  };
}

type Transition = { from: RecordStatus[]; to: RecordStatus; action: string; outcome?: string };
const TRANSITIONS: Record<string, Transition> = {
  send: { from: ['DRAFT'], to: 'PENDING', action: 'QUOTATION_SENT' },
  accept: { from: ['PENDING'], to: 'APPROVED', action: 'QUOTATION_ACCEPTED', outcome: 'accepted' },
  decline: {
    from: ['PENDING'],
    to: 'CANCELLED',
    action: 'QUOTATION_DECLINED',
    outcome: 'declined',
  },
  cancel: {
    from: ['DRAFT', 'PENDING'],
    to: 'CANCELLED',
    action: 'QUOTATION_CANCELLED',
    outcome: 'cancelled',
  },
};
const PAST: Record<keyof typeof TRANSITIONS, string> = {
  send: 'sent',
  accept: 'accepted',
  decline: 'declined',
  cancel: 'cancelled',
};

/**
 * Quotation lifecycle: DRAFT → (send) PENDING → (accept) APPROVED | (decline) CANCELLED,
 * or (cancel) CANCELLED from DRAFT/PENDING. Only drafts are editable. Generic
 * record writes for this module are rejected by ResourcesService.
 */
@ApiTags('Quotations')
@Controller('quotations')
export class QuotationsController {
  constructor(private readonly db: DatabaseService) {}

  private async customer(tx: Prisma.TransactionClient, ctx: AuthContext, id: string) {
    const customer = await tx.businessRecord.findFirst({
      where: { AND: [recordWhere(ctx, 'customers'), { id }] },
    });
    if (!customer)
      throw new BadRequestException('Customer is invalid or outside your access scope');
    return customer;
  }

  @RequirePermissions('quotations.create')
  @Post()
  create(@Body() body: QuotationDto, @Req() r: AuthenticatedRequest) {
    const priced = priceQuotation(body);
    return serializable(this.db, async (tx) => {
      const customer = await this.customer(tx, r.auth, body.customerId);
      const branchId = body.branchId ?? customer.branchId;
      if (branchId !== customer.branchId)
        throw new BadRequestException('The quotation must belong to the customer branch');
      await validateBranch(tx, r.auth, branchId);
      const record = await tx.businessRecord.create({
        data: {
          organizationId: r.auth.organizationId,
          branchId,
          module: 'quotations',
          type: 'quotation',
          name: body.title.trim(),
          number: await nextNumber(tx, r.auth.organizationId, 'quotations'),
          data: {
            customerId: customer.id,
            currency: body.currency,
            validUntil: body.validUntil ?? null,
            notes: body.notes?.trim() ?? '',
            ...priced,
          },
          createdBy: r.auth.userId,
          updatedBy: r.auth.userId,
        },
      });
      await this.audit(tx, r.auth, record.id, 'QUOTATION_CREATED', {
        total: priced.total,
        currency: body.currency,
      });
      return projectRecord(r.auth, record);
    });
  }

  @RequirePermissions('quotations.create')
  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: QuotationDto,
    @Req() r: AuthenticatedRequest,
  ) {
    const priced = priceQuotation(body);
    return serializable(this.db, async (tx) => {
      const current = await this.load(tx, r.auth, id);
      if (current.status !== 'DRAFT')
        throw new BadRequestException('Only draft quotations can be edited');
      const customer = await this.customer(tx, r.auth, body.customerId);
      if (
        customer.branchId !== current.branchId ||
        (body.branchId && body.branchId !== current.branchId)
      )
        throw new BadRequestException('A quotation cannot move to another branch');
      const record = await tx.businessRecord.update({
        where: { id },
        data: {
          name: body.title.trim(),
          data: {
            ...jsonObject(current.data),
            customerId: customer.id,
            currency: body.currency,
            validUntil: body.validUntil ?? null,
            notes: body.notes?.trim() ?? '',
            ...priced,
          },
          updatedBy: r.auth.userId,
        },
      });
      await this.audit(tx, r.auth, id, 'QUOTATION_UPDATED', {
        total: priced.total,
        currency: body.currency,
      });
      return projectRecord(r.auth, record);
    });
  }

  @RequirePermissions('quotations.send') @Post(':id/send') send(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() r: AuthenticatedRequest,
  ) {
    return this.transition(r.auth, id, 'send');
  }
  @RequirePermissions('quotations.approve') @Post(':id/accept') accept(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReasonDto,
    @Req() r: AuthenticatedRequest,
  ) {
    return this.transition(r.auth, id, 'accept', body.reason);
  }
  @RequirePermissions('quotations.approve') @Post(':id/decline') decline(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReasonDto,
    @Req() r: AuthenticatedRequest,
  ) {
    return this.transition(r.auth, id, 'decline', body.reason);
  }
  @RequirePermissions('quotations.cancel') @Post(':id/cancel') cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReasonDto,
    @Req() r: AuthenticatedRequest,
  ) {
    return this.transition(r.auth, id, 'cancel', body.reason);
  }

  private async load(tx: Prisma.TransactionClient, ctx: AuthContext, id: string) {
    const record = await tx.businessRecord.findFirst({
      where: { AND: [recordWhere(ctx, 'quotations'), { id }] },
    });
    if (!record) throw new NotFoundException('Quotation not found');
    return record;
  }

  private transition(
    ctx: AuthContext,
    id: string,
    name: keyof typeof TRANSITIONS,
    reason?: string,
  ) {
    const rule = TRANSITIONS[name];
    return serializable(this.db, async (tx) => {
      const current = await this.load(tx, ctx, id);
      if (
        current.status === rule.to &&
        (rule.outcome ?? null) === (jsonObject(current.data).outcome ?? null)
      )
        return projectRecord(ctx, current); // idempotent replay
      if (!rule.from.includes(current.status))
        throw new BadRequestException(
          `This quotation cannot be ${PAST[name]} from its current state (${current.status})`,
        );
      const data = jsonObject(current.data);
      if (
        name === 'accept' &&
        typeof data.validUntil === 'string' &&
        data.validUntil < new Date().toISOString().slice(0, 10)
      )
        throw new BadRequestException(
          'This quotation has expired; revise and resend it before accepting',
        );
      const record = await tx.businessRecord.update({
        where: { id },
        data: {
          status: rule.to,
          data: {
            ...data,
            ...(rule.outcome ? { outcome: rule.outcome, outcomeReason: reason?.trim() ?? '' } : {}),
            ...(name === 'send' ? { sentAt: new Date().toISOString() } : {}),
            ...(rule.outcome ? { decidedAt: new Date().toISOString(), decidedBy: ctx.userId } : {}),
          },
          updatedBy: ctx.userId,
        },
      });
      await this.audit(tx, ctx, id, rule.action, {
        from: current.status,
        to: rule.to,
        reason: reason ?? null,
      });
      return projectRecord(ctx, record);
    });
  }

  private audit(
    tx: Prisma.TransactionClient,
    ctx: AuthContext,
    id: string,
    action: string,
    metadata: Record<string, unknown>,
  ) {
    return tx.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        action,
        resource: 'quotations',
        resourceId: id,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }
}
