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
import { money } from './decimal';

@Controller('expenses')
export class ExpenseApprovalController {
  constructor(private readonly db: DatabaseService) {}
  @RequirePermissions('expenses.approve')
  @Post(':id/approve')
  approve(@Param('id', ParseUUIDPipe) id: string, @Req() r: AuthenticatedRequest) {
    return serializable(this.db, async (tx) => {
      const row = await tx.businessRecord.findFirst({
        where: { AND: [recordWhere(r.auth, 'expenses'), { id }] },
      });
      if (!row) throw new NotFoundException('Expense not found');
      if (row.createdBy === r.auth.userId)
        throw new ForbiddenException('A different authorized user must approve this expense');
      if (!['DRAFT', 'PENDING'].includes(row.status))
        throw new BadRequestException('Expense is not awaiting approval');
      const values = jsonObject(row.data);
      money(values.amount, String(values.currency), true);
      const approved = await tx.businessRecord.update({
        where: { id },
        data: {
          status: 'APPROVED',
          data: {
            ...jsonObject(row.data),
            approvedBy: r.auth.userId,
            approvedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
          updatedBy: r.auth.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: r.auth.organizationId,
          userId: r.auth.userId,
          action: 'EXPENSE_APPROVED',
          resource: 'expenses',
          resourceId: id,
          metadata: { from: row.status },
        },
      });
      return approved;
    });
  }
}
