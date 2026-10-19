import {
  BadRequestException,
  Controller,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { Prisma } from '@operix/database';
import { DatabaseService } from '../platform/database.module';
import { serializable } from '../platform/transaction';
import { nextNumber } from '../platform/numbering';
import { RequirePermissions } from '../security/permissions.decorator';
import {
  jsonObject,
  recordWhere,
  requireRecordReference,
  validateRecordData,
} from '../security/authorization';
import type { AuthenticatedRequest } from '../security/request-context';
import { validateRecordSchema } from '../resources/record-schemas';

@Controller('records/leads')
export class LeadConversionController {
  constructor(private readonly db: DatabaseService) {}

  @RequirePermissions('leads.convert', 'customers.create')
  @Post(':id/convert')
  convert(@Param('id', ParseUUIDPipe) id: string, @Req() r: AuthenticatedRequest) {
    return serializable(this.db, async (tx) => {
      const lead = await tx.businessRecord.findFirst({
        where: { AND: [recordWhere(r.auth, 'leads'), { id }] },
      });
      if (!lead) throw new NotFoundException('Lead not found');
      const data = jsonObject(lead.data);
      if (typeof data.convertedCustomerId === 'string')
        return requireRecordReference(tx, r.auth, 'customers', data.convertedCustomerId);
      if (data.stage !== 'qualified')
        throw new BadRequestException('Qualify the lead before conversion');
      const customerData = {
        salespersonUserId: r.auth.userId,
        ...Object.fromEntries(
          Object.entries(data).filter(([key]) =>
            ['contactName', 'email', 'phone', 'country', 'city', 'address'].includes(key),
          ),
        ),
      };
      validateRecordSchema('customers', customerData);
      await validateRecordData(tx, r.auth, 'customers', customerData, lead.branchId);
      const customer = await tx.businessRecord.create({
        data: {
          organizationId: r.auth.organizationId,
          branchId: lead.branchId,
          module: 'customers',
          type: 'company',
          name: lead.name,
          number: await nextNumber(tx, r.auth.organizationId, 'customers'),
          status: 'ACTIVE',
          data: customerData,
          createdBy: r.auth.userId,
          updatedBy: r.auth.userId,
        },
      });
      await tx.businessRecord.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          data: { ...data, convertedCustomerId: customer.id } as Prisma.InputJsonValue,
          updatedBy: r.auth.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: r.auth.organizationId,
          userId: r.auth.userId,
          action: 'LEAD_CONVERTED',
          resource: 'leads',
          resourceId: id,
          metadata: { customerId: customer.id },
        },
      });
      return customer;
    });
  }
}
