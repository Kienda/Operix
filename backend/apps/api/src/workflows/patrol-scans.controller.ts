import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  NotFoundException,
  Post,
  Req,
} from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { DatabaseService } from '../platform/database.module';
import { serializable } from '../platform/transaction';
import { RequirePermissions } from '../security/permissions.decorator';
import { jsonObject, tenantWhere } from '../security/authorization';
import type { AuthenticatedRequest } from '../security/request-context';

class ScanDto {
  @IsUUID() checkpointId!: string;
  @IsUUID() patrolId!: string;
  @IsUUID() idempotencyKey!: string;
}

@Controller('security/patrols')
export class PatrolScansController {
  constructor(private readonly db: DatabaseService) {}
  @RequirePermissions('security.patrols.execute')
  @Post('scan')
  scan(@Body() body: ScanDto, @Req() r: AuthenticatedRequest) {
    return serializable(this.db, async (tx) => {
      const base = { ...tenantWhere(r.auth), archivedAt: null, status: 'ACTIVE' as const };
      const checkpoint = await tx.businessRecord.findFirst({
        where: { ...base, id: body.checkpointId, module: 'checkpoints' },
      });
      const patrol = await tx.businessRecord.findFirst({
        where: { ...base, id: body.patrolId, module: 'patrols' },
      });
      if (!checkpoint || !patrol) throw new NotFoundException('Patrol or checkpoint not found');
      const point = jsonObject(checkpoint.data),
        route = jsonObject(patrol.data);
      if (
        typeof point.siteId !== 'string' ||
        point.siteId !== route.siteId ||
        checkpoint.branchId !== patrol.branchId ||
        !Array.isArray(route.checkpointIds) ||
        !route.checkpointIds.includes(checkpoint.id)
      )
        throw new BadRequestException('Checkpoint is not on this patrol route');
      const assignments = await tx.businessRecord.findMany({
        where: {
          ...base,
          module: 'guard-assignments',
          branchId: checkpoint.branchId,
          AND: [
            { data: { path: ['userId'], equals: r.auth.userId } },
            { data: { path: ['siteId'], equals: point.siteId } },
          ],
        },
      });
      const now = Date.now();
      if (
        !assignments.some((assignment) => {
          const shift = jsonObject(assignment.data);
          return (
            Date.parse(String(shift.startsAt)) <= now && Date.parse(String(shift.endsAt)) > now
          );
        })
      )
        throw new ForbiddenException('An active assignment to this site and shift is required');
      const number = `SCAN-${body.idempotencyKey}`;
      const existing = await tx.businessRecord.findFirst({
        where: {
          organizationId: r.auth.organizationId,
          module: 'checkpoint-scans',
          number,
          createdBy: r.auth.userId,
        },
      });
      if (existing) {
        const data = jsonObject(existing.data);
        if (data.checkpointId !== checkpoint.id || data.patrolId !== patrol.id)
          throw new ConflictException('Scan key already used for a different checkpoint');
        return existing;
      }
      const scan = await tx.businessRecord.create({
        data: {
          organizationId: r.auth.organizationId,
          branchId: checkpoint.branchId,
          module: 'checkpoint-scans',
          type: 'scan',
          name: checkpoint.name,
          number,
          status: 'COMPLETED',
          createdBy: r.auth.userId,
          updatedBy: r.auth.userId,
          data: {
            checkpointId: checkpoint.id,
            patrolId: patrol.id,
            siteId: point.siteId,
            capturedAt: new Date(now).toISOString(),
          },
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: r.auth.organizationId,
          userId: r.auth.userId,
          action: 'CHECKPOINT_SCANNED',
          resource: 'checkpoint-scans',
          resourceId: scan.id,
          metadata: { checkpointId: checkpoint.id, patrolId: patrol.id },
        },
      });
      return scan;
    });
  }
}
