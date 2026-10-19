import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID, ValidateNested } from 'class-validator';
import { Prisma } from '@operix/database';
import { DatabaseService } from '../platform/database.module';
import { serializable } from '../platform/transaction';
import { RequirePermissions } from '../security/permissions.decorator';
import { jsonObject, recordWhere } from '../security/authorization';
import type { AuthenticatedRequest } from '../security/request-context';
import { decimal, DecimalInput } from './decimal';
import { postStockMovement } from './inventory.controller';

class ReceivingLineDto {
  @IsUUID() itemId!: string;
  @DecimalInput(4, true) quantity!: string | number;
}
class ReceivingDto {
  @IsUUID() idempotencyKey!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReceivingLineDto)
  items!: ReceivingLineDto[];
}

@Controller('records/purchase-orders')
export class GoodsReceivingController {
  constructor(private readonly db: DatabaseService) {}
  @RequirePermissions('purchase_orders.receive', 'inventory.receive')
  @Post(':id/receive')
  receive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReceivingDto,
    @Req() r: AuthenticatedRequest,
  ) {
    return serializable(this.db, async (tx) => {
      const order = await tx.businessRecord.findFirst({
        where: { AND: [recordWhere(r.auth, 'purchase-orders'), { id }] },
      });
      if (!order) throw new NotFoundException('Purchase order not found');
      const data = jsonObject(order.data);
      const planned = Array.isArray(data.items) ? data.items.map(jsonObject) : [];
      if (
        !planned.length ||
        planned.some((line) => typeof line.itemId !== 'string') ||
        new Set(planned.map((line) => line.itemId)).size !== planned.length
      )
        throw new BadRequestException('Purchase order requires unique planned item quantities');
      const items = body.items
        .map((line) => ({
          itemId: line.itemId,
          quantity: decimal(line.quantity, 4, true).toFixed(),
        }))
        .sort((a, b) => a.itemId.localeCompare(b.itemId));
      if (new Set(items.map((line) => line.itemId)).size !== items.length)
        throw new BadRequestException('Duplicate receiving item');
      const receipts = Array.isArray(data.receipts) ? data.receipts.map(jsonObject) : [];
      const existing = receipts.find((receipt) => receipt.idempotencyKey === body.idempotencyKey);
      if (existing) {
        if (JSON.stringify(existing.items) !== JSON.stringify(items))
          throw new ConflictException('Receiving key already used with different quantities');
        return existing;
      }
      if (order.status !== 'APPROVED')
        throw new BadRequestException('Send the purchase order before receiving');
      if (receipts.length >= 100)
        throw new BadRequestException('Purchase order receipt limit reached');
      const received = (itemId: string) =>
        receipts.reduce(
          (sum, receipt) =>
            sum.add(
              (Array.isArray(receipt.items) ? receipt.items.map(jsonObject) : [])
                .filter((line) => line.itemId === itemId)
                .reduce(
                  (total, line) => total.add(decimal(line.quantity, 4, true)),
                  new Prisma.Decimal(0),
                ),
            ),
          new Prisma.Decimal(0),
        );
      for (const line of items) {
        const plan = planned.find((item) => item.itemId === line.itemId);
        if (
          !plan ||
          received(line.itemId)
            .add(line.quantity)
            .gt(decimal(plan.quantity, 4, true))
        )
          throw new BadRequestException('Received quantity exceeds the purchase order');
      }
      // Reuse the ledger's reconciliation, branch matching, idempotency and balance checks.
      for (const line of items)
        await postStockMovement(tx, r, line.itemId, {
          type: 'PURCHASE_RECEIPT',
          quantity: line.quantity,
          idempotencyKey: body.idempotencyKey,
          referenceType: 'purchase-order',
          referenceId: id,
        });
      const receipt = {
        idempotencyKey: body.idempotencyKey,
        items,
        receivedBy: r.auth.userId,
        receivedAt: new Date().toISOString(),
      };
      const complete = planned.every((plan) =>
        received(String(plan.itemId))
          .add(items.find((line) => line.itemId === plan.itemId)?.quantity ?? 0)
          .equals(decimal(plan.quantity, 4, true)),
      );
      await tx.businessRecord.update({
        where: { id },
        data: {
          status: complete ? 'COMPLETED' : 'APPROVED',
          data: { ...data, receipts: [...receipts, receipt] } as Prisma.InputJsonValue,
          updatedBy: r.auth.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: r.auth.organizationId,
          userId: r.auth.userId,
          action: 'GOODS_RECEIVED',
          resource: 'purchase-orders',
          resourceId: id,
          metadata: { idempotencyKey: body.idempotencyKey, items },
        },
      });
      return receipt;
    });
  }
}
