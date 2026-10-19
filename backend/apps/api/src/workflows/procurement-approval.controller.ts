import {
  BadRequestException,
  Controller,
  ForbiddenException,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { Prisma } from '@operix/database';
import { DatabaseService } from '../platform/database.module';
import { serializable } from '../platform/transaction';
import { RequirePermissions } from '../security/permissions.decorator';
import { jsonObject, recordWhere } from '../security/authorization';
import type { AuthenticatedRequest } from '../security/request-context';

@Controller()
export class ProcurementApprovalController {
  constructor(private readonly db: DatabaseService) {}
  @RequirePermissions('purchase_requests.approve')
  @Post('purchase-requests/:id/approve')
  approve(@Param('id', ParseUUIDPipe) id: string, @Req() r: AuthenticatedRequest) {
    return this.transition(r, 'purchase-requests', id);
  }
  @RequirePermissions('purchase_orders.send')
  @Post('purchase-orders/:id/send')
  send(@Param('id', ParseUUIDPipe) id: string, @Req() r: AuthenticatedRequest) {
    return this.transition(r, 'purchase-orders', id);
  }
  private transition(
    r: AuthenticatedRequest,
    module: 'purchase-requests' | 'purchase-orders',
    id: string,
  ) {
    return serializable(this.db, async (tx) => {
      const row = await tx.businessRecord.findFirst({
        where: { AND: [recordWhere(r.auth, module), { id }] },
      });
      if (!row) throw new NotFoundException('Purchase record not found');
      if (module === 'purchase-requests' && row.createdBy === r.auth.userId)
        throw new ForbiddenException('A different authorized user must approve this request');
      if (!(module === 'purchase-orders' ? ['DRAFT'] : ['DRAFT', 'PENDING']).includes(row.status))
        throw new BadRequestException('Purchase record is not in the required state');
      const stamp =
        module === 'purchase-orders'
          ? { sentBy: r.auth.userId, sentAt: new Date().toISOString() }
          : { approvedBy: r.auth.userId, approvedAt: new Date().toISOString() };
      const updated = await tx.businessRecord.update({
        where: { id },
        data: {
          status: 'APPROVED',
          data: { ...jsonObject(row.data), ...stamp } as Prisma.InputJsonValue,
          updatedBy: r.auth.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: r.auth.organizationId,
          userId: r.auth.userId,
          action:
            module === 'purchase-orders' ? 'PURCHASE_ORDER_SENT' : 'PURCHASE_REQUEST_APPROVED',
          resource: module,
          resourceId: id,
          metadata: { from: row.status },
        },
      });
      return updated;
    });
  }
}
