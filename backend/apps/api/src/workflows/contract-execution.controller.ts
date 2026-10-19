import {
  BadRequestException,
  Body,
  Controller,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { Prisma, type RecordStatus } from '@operix/database';
import { DatabaseService } from '../platform/database.module';
import { serializable } from '../platform/transaction';
import { RequirePermissions } from '../security/permissions.decorator';
import { jsonObject, recordWhere, requireRecordReference } from '../security/authorization';
import type { AuthenticatedRequest } from '../security/request-context';

class SignedDocumentDto {
  @IsUUID() documentId!: string;
}

@Controller('contracts')
export class ContractExecutionController {
  constructor(private readonly db: DatabaseService) {}
  @RequirePermissions('contracts.approve')
  @Post(':id/approve')
  approve(@Param('id', ParseUUIDPipe) id: string, @Req() r: AuthenticatedRequest) {
    return this.transition(r, id, 'DRAFT', 'APPROVED', 'CONTRACT_APPROVED');
  }
  @RequirePermissions('contracts.upload_signed')
  @Post(':id/upload-signed')
  attach(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SignedDocumentDto,
    @Req() r: AuthenticatedRequest,
  ) {
    return this.transition(
      r,
      id,
      'APPROVED',
      'PENDING',
      'CONTRACT_SIGNED_DOCUMENT_ATTACHED',
      body.documentId,
    );
  }
  @RequirePermissions('contracts.countersign')
  @Post(':id/countersign')
  countersign(@Param('id', ParseUUIDPipe) id: string, @Req() r: AuthenticatedRequest) {
    return this.transition(r, id, 'PENDING', 'COMPLETED', 'CONTRACT_COUNTERSIGNED');
  }
  private transition(
    r: AuthenticatedRequest,
    id: string,
    from: RecordStatus,
    to: RecordStatus,
    action: string,
    documentId?: string,
  ) {
    return serializable(this.db, async (tx) => {
      const row = await tx.businessRecord.findFirst({
        where: { AND: [recordWhere(r.auth, 'contracts'), { id }] },
      });
      if (!row) throw new NotFoundException('Contract not found');
      if (row.status !== from) throw new BadRequestException('Invalid contract state');
      const data = jsonObject(row.data),
        patch: Record<string, string> = {};
      if (action === 'CONTRACT_APPROVED') {
        patch.approvedBy = r.auth.userId;
        patch.approvedAt = new Date().toISOString();
      } else {
        const signedId = documentId ?? data.signedDocumentId;
        if (typeof signedId !== 'string')
          throw new BadRequestException('A signed document is required');
        const document = await requireRecordReference(tx, r.auth, 'documents', signedId);
        if (document.branchId !== row.branchId)
          throw new BadRequestException('Signed document must belong to the contract branch');
        patch.signedDocumentId = signedId;
        if (documentId) {
          patch.signedBy = r.auth.userId;
          patch.signedAt = new Date().toISOString();
        } else {
          patch.countersignedBy = r.auth.userId;
          patch.countersignedAt = new Date().toISOString();
        }
      }
      const updated = await tx.businessRecord.update({
        where: { id },
        data: {
          status: to,
          data: { ...data, ...patch } as Prisma.InputJsonValue,
          updatedBy: r.auth.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: r.auth.organizationId,
          userId: r.auth.userId,
          action,
          resource: 'contracts',
          resourceId: id,
          metadata: { from, to },
        },
      });
      return updated;
    });
  }
}
