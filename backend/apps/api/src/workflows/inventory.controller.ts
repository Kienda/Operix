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
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { MovementType, Prisma } from '@operix/database';
import { DatabaseService } from '../platform/database.module';
import { serializable } from '../platform/transaction';
import type { AuthenticatedRequest } from '../security/request-context';
import {
  inventoryWhere,
  requirePermissions,
  requireRecordReference,
  validateBranch,
} from '../security/authorization';
import { RequirePermissions } from '../security/permissions.decorator';
import { decimal, DecimalInput, money } from './decimal';

class ItemDto {
  @IsString() @MinLength(1) code!: string;
  @IsString() @MinLength(1) name!: string;
  @IsString() category!: string;
  @IsString() unit!: string;
  @IsIn(['USD', 'EUR', 'GNF']) currency!: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @DecimalInput(4) minimumStock?: string | number;
  @IsOptional() @DecimalInput(2) cost?: string | number;
}
class MovementDto {
  @IsEnum(MovementType) type!: MovementType;
  @DecimalInput(4, true, true) quantity!: string | number;
  @IsUUID() idempotencyKey!: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsString() referenceType?: string;
  @IsOptional() @IsUUID() referenceId?: string;
}
const additions = new Set<MovementType>(['INITIAL', 'PURCHASE_RECEIPT', 'RETURN', 'ADJUSTMENT']);
const movementPermissions: Partial<Record<MovementType, string>> = {
  INITIAL: 'inventory.receive',
  PURCHASE_RECEIPT: 'inventory.receive',
  RETURN: 'inventory.return',
  ISSUE: 'inventory.issue',
  SALE: 'inventory.issue',
  DAMAGE: 'inventory.adjust',
  WASTE: 'waste.report',
  EXPIRATION: 'inventory.adjust',
  ADJUSTMENT: 'inventory.adjust',
};
const referenceModules: Record<string, string> = {
  project: 'projects',
  'purchase-order': 'purchase-orders',
  'work-order': 'work-orders',
};

@ApiTags('Inventory')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly db: DatabaseService) {}

  @RequirePermissions('inventory.view')
  @Get('items/:id/movements')
  async movements(@Param('id', ParseUUIDPipe) id: string, @Req() r: AuthenticatedRequest) {
    const item = await this.db.inventoryItem.findFirst({
      where: { AND: [inventoryWhere(r.auth), { id }] },
    });
    if (!item) throw new NotFoundException('Inventory item not found');
    return this.db.inventoryMovement.findMany({
      where: { organizationId: r.auth.organizationId, itemId: id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
  }

  @RequirePermissions('inventory.view')
  @Get('items')
  list(@Req() r: AuthenticatedRequest, @Query('lowStock') low?: string) {
    return this.db.inventoryItem.findMany({
      where: {
        ...inventoryWhere(r.auth),
        ...(low === 'true' ? { quantity: { lte: this.db.inventoryItem.fields.minimumStock } } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  @RequirePermissions('inventory.receive')
  @Post('items')
  create(@Body() b: ItemDto, @Req() r: AuthenticatedRequest) {
    if (['self', 'assigned', 'customer'].includes(r.auth.dataScope))
      throw new BadRequestException('Inventory requires an organization or branch scope');
    return serializable(this.db, async (tx) => {
      await validateBranch(tx, r.auth, b.branchId);
      return tx.inventoryItem.create({
        data: {
          ...b,
          minimumStock: decimal(b.minimumStock ?? 0, 4),
          cost: money(b.cost ?? 0, b.currency),
          organizationId: r.auth.organizationId,
          quantity: 0,
          openingQuantity: 0,
        },
      });
    });
  }

  @Post('items/:id/movements')
  async move(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: MovementDto,
    @Req() r: AuthenticatedRequest,
  ) {
    if (b.type === 'PURCHASE_RECEIPT' && b.referenceType === 'purchase-order') {
      requirePermissions(r.auth, 'inventory.receive');
      throw new BadRequestException(
        'Receive a purchase order through its dedicated receiving command',
      );
    }
    const execute = () => serializable(this.db, (tx) => postStockMovement(tx, r, id, b));
    try {
      return await execute();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return execute();
      throw e;
    }
  }
}

/** Shared atomic posting path; procurement uses the same permission, reconciliation and balance checks. */
export async function postStockMovement(
  tx: Prisma.TransactionClient,
  r: AuthenticatedRequest,
  id: string,
  b: MovementDto,
) {
  if (b.type === 'TRANSFER' || b.type === 'RESERVATION')
    throw new BadRequestException(
      'This movement requires a dedicated paired-transfer or reservation workflow',
    );
  const permission = movementPermissions[b.type];
  if (!permission) throw new BadRequestException('Unsupported movement');
  requirePermissions(r.auth, permission);
  const quantity = decimal(b.quantity, 4, true, b.type === 'ADJUSTMENT');
  if (b.type === 'ADJUSTMENT' && (!b.notes || b.notes.trim().length < 10))
    throw new BadRequestException('An adjustment requires a meaningful reason');
  if (
    !!b.referenceType !== !!b.referenceId ||
    (b.referenceType && !referenceModules[b.referenceType])
  )
    throw new BadRequestException('Invalid stock reference type/id');

  const item = await tx.inventoryItem.findFirst({
    where: { AND: [inventoryWhere(r.auth), { id }] },
  });
  if (!item) throw new NotFoundException('Inventory item not found');
  if (b.referenceId) {
    const reference = await requireRecordReference(
      tx,
      r.auth,
      referenceModules[b.referenceType!],
      b.referenceId,
    );
    if (reference.branchId !== item.branchId)
      throw new BadRequestException('Stock reference belongs to another branch');
  }
  const existing = await tx.inventoryMovement.findUnique({
    where: {
      organizationId_itemId_idempotencyKey: {
        organizationId: r.auth.organizationId,
        itemId: id,
        idempotencyKey: b.idempotencyKey,
      },
    },
  });
  if (existing) {
    if (
      existing.type !== b.type ||
      !existing.quantity.equals(quantity) ||
      existing.referenceId !== (b.referenceId ?? null) ||
      existing.referenceType !== (b.referenceType ?? null) ||
      existing.notes !== (b.notes ?? null)
    )
      throw new ConflictException('Idempotency key already used for another movement');
    return existing;
  }
  const history = await tx.inventoryMovement.groupBy({
    by: ['type'],
    where: { organizationId: r.auth.organizationId, itemId: id },
    _sum: { quantity: true },
    _count: true,
  });
  if (history.some((m) => m.type === 'TRANSFER' || m.type === 'RESERVATION'))
    throw new ConflictException('Legacy movements require reconciliation');
  const authoritative = history.reduce(
    (sum, m) =>
      additions.has(m.type) ? sum.add(m._sum.quantity ?? 0) : sum.sub(m._sum.quantity ?? 0),
    item.openingQuantity,
  );
  if (!authoritative.equals(item.quantity))
    throw new ConflictException('Stock balance requires reconciliation before posting');
  if (
    b.type === 'INITIAL' &&
    (history.length || !item.quantity.isZero() || !item.openingQuantity.isZero())
  )
    throw new BadRequestException('Opening stock has already been established');
  const delta = additions.has(b.type) ? quantity : quantity.negated();
  const next = authoritative.add(delta);
  if (next.lt(item.reserved)) throw new BadRequestException('Insufficient available inventory');
  decimal(next.toFixed(), 4);
  await tx.inventoryItem.update({ where: { id }, data: { quantity: next } });
  return tx.inventoryMovement.create({
    data: {
      organizationId: r.auth.organizationId,
      itemId: id,
      type: b.type,
      quantity,
      balanceAfter: next,
      idempotencyKey: b.idempotencyKey,
      referenceType: b.referenceType,
      referenceId: b.referenceId,
      notes: b.notes,
      createdBy: r.auth.userId,
    },
  });
}
