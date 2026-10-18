import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Prisma, type RecordStatus } from '@operix/database';
import { DatabaseService } from '../platform/database.module';
import type { AuthenticatedRequest } from '../security/request-context';
import { RequirePermissions } from '../security/permissions.decorator';
import {
  jsonObject,
  projectRecord,
  recordWhere,
  requirePermissions,
} from '../security/authorization';
import { serializable } from '../platform/transaction';

class StartProjectDto {
  @IsOptional() @IsString() @MinLength(10) @MaxLength(500) overrideReason?: string;
}
class ReasonDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

type ContractRequirement =
  | 'not_required'
  | 'before_work_starts'
  | 'before_production'
  | 'before_material_issue'
  | 'before_delivery'
  | 'before_installation';

interface ProjectData {
  contractRequirement?: ContractRequirement;
  customerId?: string;
}

/**
 * Enforces the spec's contract-requirement gate: a project configured to
 * require a contract cannot start until a fully executed contract linked to
 * it exists, unless an authorized user supplies a written override reason —
 * which is itself audited. Contracts and projects both live as
 * `BusinessRecord` rows (module `contracts` / `projects`); a contract counts
 * as fully executed once its status reaches `COMPLETED`.
 */
@ApiTags('Projects')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly db: DatabaseService) {}

  @RequirePermissions('projects.change_status')
  @Post(':id/start')
  async start(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: StartProjectDto,
    @Req() r: AuthenticatedRequest,
  ) {
    return serializable(this.db, async (tx) => {
      const project = await tx.businessRecord.findFirst({
        where: { AND: [recordWhere(r.auth, 'projects'), { id }] },
      });
      if (!project) throw new NotFoundException('Project not found');
      if (!['DRAFT', 'PENDING', 'APPROVED', 'IN_PROGRESS'].includes(project.status))
        throw new BadRequestException('Project cannot be started from its current state');
      if (project.status === 'IN_PROGRESS') return projectRecord(r.auth, project);
      if (project.status === 'PENDING' && jsonObject(project.data).holdReason)
        throw new BadRequestException('This project is on hold; resume it instead');

      const data = project.data as ProjectData;
      const requirement: ContractRequirement = data.contractRequirement ?? 'not_required';

      if (requirement !== 'not_required') {
        const contract = await tx.businessRecord.findFirst({
          where: {
            organizationId: r.auth.organizationId,
            module: 'contracts',
            status: 'COMPLETED',
            archivedAt: null,
            branchId: project.branchId,
            data: { path: ['projectId'], equals: id },
          },
        });

        if (!contract) {
          if (!body.overrideReason) {
            throw new BadRequestException(
              `This project requires a fully executed contract (${requirement}) before it can start`,
            );
          }
          requirePermissions(r.auth, 'contracts.override_gate');
          await tx.auditLog.create({
            data: {
              organizationId: r.auth.organizationId,
              userId: r.auth.userId,
              action: 'CONTRACT_GATE_OVERRIDE',
              resource: 'projects',
              resourceId: id,
              metadata: { reason: body.overrideReason, requirement },
            },
          });
        }
      }

      const started = await tx.businessRecord.update({
        where: { id },
        data: { status: 'IN_PROGRESS', updatedBy: r.auth.userId },
      });
      await this.audit(tx, r, id, 'PROJECT_STARTED', { from: project.status });
      return projectRecord(r.auth, started);
    });
  }

  /** IN_PROGRESS → PENDING (on hold), with a recorded reason. */
  @RequirePermissions('projects.change_status')
  @Post(':id/hold')
  hold(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReasonDto,
    @Req() r: AuthenticatedRequest,
  ) {
    if (!body.reason?.trim())
      throw new BadRequestException('A reason is required to put a project on hold');
    return this.transition(r, id, ['IN_PROGRESS'], 'PENDING', 'PROJECT_ON_HOLD', {
      holdReason: body.reason.trim(),
    });
  }

  /** PENDING (on hold) → IN_PROGRESS. A project that never started uses /start. */
  @RequirePermissions('projects.change_status')
  @Post(':id/resume')
  resume(@Param('id', ParseUUIDPipe) id: string, @Req() r: AuthenticatedRequest) {
    return this.transition(
      r,
      id,
      ['PENDING'],
      'IN_PROGRESS',
      'PROJECT_RESUMED',
      { holdReason: null },
      true,
    );
  }

  @RequirePermissions('projects.change_status')
  @Post(':id/complete')
  complete(@Param('id', ParseUUIDPipe) id: string, @Req() r: AuthenticatedRequest) {
    return this.transition(r, id, ['IN_PROGRESS'], 'COMPLETED', 'PROJECT_COMPLETED', {});
  }

  @RequirePermissions('projects.change_status')
  @Post(':id/cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReasonDto,
    @Req() r: AuthenticatedRequest,
  ) {
    if (!body.reason?.trim())
      throw new BadRequestException('A reason is required to cancel a project');
    return this.transition(
      r,
      id,
      ['DRAFT', 'PENDING', 'IN_PROGRESS'],
      'CANCELLED',
      'PROJECT_CANCELLED',
      {
        cancelReason: body.reason.trim(),
      },
    );
  }

  private transition(
    r: AuthenticatedRequest,
    id: string,
    from: RecordStatus[],
    to: RecordStatus,
    action: string,
    patch: Record<string, unknown>,
    requireHoldMarker = false,
  ) {
    return serializable(this.db, async (tx) => {
      const project = await tx.businessRecord.findFirst({
        where: { AND: [recordWhere(r.auth, 'projects'), { id }] },
      });
      if (!project) throw new NotFoundException('Project not found');
      if (project.status === to) return projectRecord(r.auth, project);
      const data = jsonObject(project.data);
      if (!from.includes(project.status) || (requireHoldMarker && !data.holdReason))
        throw new BadRequestException(`The project cannot move from ${project.status} to ${to}`);
      const updated = await tx.businessRecord.update({
        where: { id },
        data: {
          status: to,
          data: { ...data, ...patch } as Prisma.InputJsonValue,
          updatedBy: r.auth.userId,
        },
      });
      await this.audit(tx, r, id, action, { from: project.status, to, ...patch });
      return projectRecord(r.auth, updated);
    });
  }

  private audit(
    tx: Prisma.TransactionClient,
    r: AuthenticatedRequest,
    id: string,
    action: string,
    metadata: Record<string, unknown>,
  ) {
    return tx.auditLog.create({
      data: {
        organizationId: r.auth.organizationId,
        userId: r.auth.userId,
        action,
        resource: 'projects',
        resourceId: id,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }
}
