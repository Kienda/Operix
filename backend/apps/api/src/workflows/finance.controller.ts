import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Prisma } from '@operix/database';
import { DatabaseService } from '../platform/database.module';
import { serializable } from '../platform/transaction';
import type { AuthenticatedRequest, AuthContext } from '../security/request-context';
import { financialWhere, requireRecordReference, validateBranch } from '../security/authorization';
import { RequirePermissions } from '../security/permissions.decorator';
import { DecimalInput, money } from './decimal';

class InvoiceDto {
  @IsUUID() customerId!: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsString() @MinLength(1) @MaxLength(100) number!: string;
  @IsIn(['USD', 'EUR', 'GNF']) currency!: string;
  @DecimalInput(2) subtotal!: string | number;
  @DecimalInput(2) tax!: string | number;
  @IsOptional() @IsDateString() dueAt?: string;
}
class AllocationDto {
  @IsUUID() invoiceId!: string;
  @DecimalInput(2, true) amount!: string | number;
}
class PaymentDto {
  @IsUUID() customerId!: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsString() @MinLength(1) @MaxLength(100) number!: string;
  @DecimalInput(2, true) amount!: string | number;
  @IsIn(['USD', 'EUR', 'GNF']) currency!: string;
  @IsString() @MinLength(1) @MaxLength(80) method!: string;
  @IsOptional() @IsString() @MaxLength(200) reference?: string;
  @IsDateString() receivedAt!: string;
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AllocationDto)
  allocations!: AllocationDto[];
}

type StoredPayment = Prisma.PaymentGetPayload<{ include: { allocations: true } }>;
function sameRequest(
  payment: StoredPayment,
  body: PaymentDto,
  amount: Prisma.Decimal,
  allocations: Array<{ invoiceId: string; amount: Prisma.Decimal }>,
) {
  return (
    payment.customerId === body.customerId &&
    payment.branchId === (body.branchId ?? null) &&
    payment.currency === body.currency &&
    payment.amount.equals(amount) &&
    payment.method === body.method &&
    payment.reference === (body.reference ?? null) &&
    payment.receivedAt.getTime() === new Date(body.receivedAt).getTime() &&
    payment.allocations.length === allocations.length &&
    allocations.every((a) =>
      payment.allocations.some((p) => p.invoiceId === a.invoiceId && p.amount.equals(a.amount)),
    )
  );
}
async function customer(
  db: Prisma.TransactionClient,
  ctx: AuthContext,
  customerId: string,
  branchId?: string | null,
) {
  await validateBranch(db, ctx, branchId);
  const c = await requireRecordReference(db, ctx, 'customers', customerId);
  if (c.branchId !== (branchId ?? null))
    throw new BadRequestException('Customer and transaction must belong to the same branch');
}

@ApiTags('Finance')
@Controller('finance')
export class FinanceController {
  constructor(private readonly db: DatabaseService) {}

  @RequirePermissions('invoices.create')
  @Post('invoices')
  createInvoice(@Body() b: InvoiceDto, @Req() r: AuthenticatedRequest) {
    const subtotal = money(b.subtotal, b.currency),
      tax = money(b.tax, b.currency);
    const total = money(subtotal.add(tax).toFixed(), b.currency);
    return serializable(this.db, async (tx) => {
      await customer(tx, r.auth, b.customerId, b.branchId);
      return tx.invoice.create({
        data: {
          ...b,
          subtotal,
          tax,
          total,
          dueAt: b.dueAt ? new Date(b.dueAt) : undefined,
          organizationId: r.auth.organizationId,
          createdBy: r.auth.userId,
        },
      });
    });
  }

  @RequirePermissions('payments.record')
  @Post('payments')
  async recordPayment(@Body() b: PaymentDto, @Req() r: AuthenticatedRequest) {
    const amount = money(b.amount, b.currency, true);
    const allocations = b.allocations.map((a) => ({
      invoiceId: a.invoiceId,
      amount: money(a.amount, b.currency, true),
    }));
    if (new Set(allocations.map((a) => a.invoiceId)).size !== allocations.length)
      throw new BadRequestException('Duplicate invoice allocation');
    if (allocations.reduce((sum, a) => sum.add(a.amount), new Prisma.Decimal(0)).gt(amount))
      throw new BadRequestException('Allocated amount exceeds payment amount');
    const execute = () =>
      serializable(this.db, async (tx) => {
        await customer(tx, r.auth, b.customerId, b.branchId);
        const existing = await tx.payment.findFirst({
          where: { organizationId: r.auth.organizationId, number: b.number },
          include: { allocations: true },
        });
        if (existing) {
          const visible = await tx.payment.findFirst({
            where: { AND: [financialWhere(r.auth), { id: existing.id }] },
          });
          if (!visible || !sameRequest(existing, b, amount, allocations))
            throw new ConflictException('Payment number already used for a different request');
          return existing;
        }
        for (const allocation of allocations) {
          const invoice = await tx.invoice.findFirst({
            where: { AND: [financialWhere(r.auth), { id: allocation.invoiceId }] },
          });
          if (
            !invoice ||
            invoice.customerId !== b.customerId ||
            invoice.currency !== b.currency ||
            invoice.branchId !== (b.branchId ?? null) ||
            invoice.status === 'CANCELLED'
          )
            throw new BadRequestException(
              'Invoice does not match customer, currency, branch or access scope',
            );
          if (allocation.amount.gt(invoice.total))
            throw new BadRequestException('Allocation exceeds invoice total');
        }
        return tx.payment.create({
          data: {
            organizationId: r.auth.organizationId,
            branchId: b.branchId,
            customerId: b.customerId,
            number: b.number,
            amount,
            currency: b.currency,
            method: b.method,
            reference: b.reference,
            receivedAt: new Date(b.receivedAt),
            createdBy: r.auth.userId,
            allocations: { create: allocations },
          },
          include: { allocations: true },
        });
      });
    try {
      return await execute();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return execute();
      throw e;
    }
  }

  @RequirePermissions('payments.verify')
  @Post('payments/:id/verify')
  verify(@Param('id', ParseUUIDPipe) id: string, @Req() r: AuthenticatedRequest) {
    return serializable(this.db, async (tx) => {
      const payment = await tx.payment.findFirst({
        where: { AND: [financialWhere(r.auth), { id }] },
        include: { allocations: true },
      });
      if (!payment) throw new NotFoundException('Payment not found');
      if (!['PENDING_VERIFICATION', 'VERIFIED'].includes(payment.status))
        throw new BadRequestException('Payment cannot be verified');
      await customer(tx, r.auth, payment.customerId, payment.branchId);
      const amount = money(payment.amount.toFixed(), payment.currency, true);
      const sum = payment.allocations.reduce(
        (s, a) => s.add(money(a.amount.toFixed(), payment.currency, true)),
        new Prisma.Decimal(0),
      );
      if (sum.gt(amount)) throw new BadRequestException('Allocated amount exceeds payment amount');
      for (const allocation of [...payment.allocations].sort((a, b) =>
        a.invoiceId.localeCompare(b.invoiceId),
      )) {
        const invoice = await tx.invoice.findFirst({
          where: { AND: [financialWhere(r.auth), { id: allocation.invoiceId }] },
        });
        if (
          !invoice ||
          invoice.customerId !== payment.customerId ||
          invoice.currency !== payment.currency ||
          invoice.branchId !== payment.branchId ||
          invoice.status === 'CANCELLED'
        )
          throw new BadRequestException('Invalid invoice allocation');
        const ledger = await tx.paymentAllocation.aggregate({
          where: {
            organizationId: r.auth.organizationId,
            invoiceId: invoice.id,
            payment: { status: 'VERIFIED' },
          },
          _sum: { amount: true },
        });
        const authoritative = ledger._sum.amount ?? new Prisma.Decimal(0);
        if (!invoice.paid.equals(authoritative))
          throw new ConflictException('Invoice balance requires reconciliation before posting');
        if (payment.status === 'VERIFIED') continue;
        const paid = authoritative.add(allocation.amount);
        if (paid.gt(invoice.total)) throw new BadRequestException('Payment would overpay invoice');
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { paid, status: paid.equals(invoice.total) ? 'PAID' : 'PARTIAL' },
        });
      }
      if (payment.status === 'VERIFIED') return payment;
      return tx.payment.update({
        where: { id },
        data: { status: 'VERIFIED', verifiedBy: r.auth.userId, verifiedAt: new Date() },
      });
    });
  }

  @RequirePermissions('reports.view', 'invoices.view', 'payments.view', 'balances.view')
  @Get('summary')
  async summary(@Req() r: AuthenticatedRequest) {
    const [invoices, payments] = await this.db.$transaction(
      [
        this.db.invoice.groupBy({
          by: ['currency'],
          orderBy: { currency: 'asc' },
          where: financialWhere(r.auth),
          _sum: { total: true, paid: true },
          _count: true,
        }),
        this.db.payment.groupBy({
          by: ['currency'],
          orderBy: { currency: 'asc' },
          where: { ...financialWhere(r.auth), status: 'VERIFIED' },
          _sum: { amount: true },
          _count: true,
        }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { invoices, payments };
  }
}
