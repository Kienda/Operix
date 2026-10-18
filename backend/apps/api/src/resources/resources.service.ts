import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RecordStatus } from '@operix/database';
import { DatabaseService } from '../platform/database.module';
import { serializable } from '../platform/transaction';
import type { AuthContext } from '../security/request-context';
import {
  can,
  jsonObject,
  projectRecord,
  recordWhere,
  requirePermissions,
  validateBranch,
  validateEmployeeWrite,
  validateRecordData,
  validateSensitiveWrite,
} from '../security/authorization';
import { nextNumber, NUMBER_FORMATS } from '../platform/numbering';
import { COMMAND_FIELDS, STATUS_POLICY, validateRecordSchema } from './record-schemas';

/** Modules whose writes go exclusively through dedicated domain controllers. */
const COMMAND_ONLY = new Set(['quotations']);
/** A child record lives in its parent's branch. */
const PARENT_BRANCH: Record<string, [field: string, module: string, required: boolean]> = {
  tasks: ['projectId', 'projects', true],
  projects: ['customerId', 'customers', false],
};
const SELF_EDITABLE_TASK_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED'];
type Tx = Prisma.TransactionClient;

async function parentBranch(
  tx: Tx,
  ctx: AuthContext,
  module: string,
  data: Record<string, unknown>,
  branchId: string | null | undefined,
) {
  const rule = PARENT_BRANCH[module];
  if (!rule) return branchId;
  const [field, parentModule, required] = rule;
  const parentId = data[field];
  if (parentId == null || parentId === '') {
    if (required) throw new BadRequestException(`${field}: is required`);
    return branchId;
  }
  if (typeof parentId !== 'string') throw new BadRequestException(`Invalid ${field}`);
  const parent = await tx.businessRecord.findFirst({
    where: { AND: [recordWhere(ctx, parentModule), { id: parentId }] },
  });
  if (!parent) throw new BadRequestException('Reference is invalid or outside your access scope');
  if (branchId === undefined && parent.branchId) return parent.branchId;
  if ((branchId ?? null) !== parent.branchId)
    throw new BadRequestException(`${field}: must belong to the same branch`);
  return branchId;
}

const protectedWorkflows = new Set([
  'projects',
  'contracts',
  'quotations',
  'expenses',
  'purchase-requests',
  'purchase-orders',
  'payroll-runs',
  'production-jobs',
  'work-orders',
  'leave-requests',
]);
const assignmentPermission: Record<string, string> = {
  tasks: 'tasks.assign',
  projects: 'projects.manage_members',
  leads: 'leads.assign',
  'work-orders': 'work_orders.assign',
  'production-jobs': 'production.assign',
  assets: 'assets.assign',
};
const assignmentKeys = [
  'assigneeUserId',
  'assignedToUserId',
  'salespersonUserId',
  'projectManagerUserId',
  'memberUserIds',
  'assigneeUserIds',
  'recipientUserId',
  'userId',
  'employeeId',
];
type CreateInput = {
  module: string;
  type: string;
  name: string;
  number?: string;
  branchId?: string;
  data?: Record<string, unknown>;
};
type UpdateInput = { name?: string; status?: string; data?: Record<string, unknown> };

function validateStatus(status?: string) {
  if (status && !Object.values(RecordStatus).includes(status as RecordStatus))
    throw new BadRequestException('Invalid record status');
}
function validateDataState(data: Record<string, unknown>) {
  if (
    ['status', 'archivedAt', 'createdBy', 'updatedBy', 'organizationId'].some((key) => key in data)
  )
    throw new BadRequestException('Record control fields cannot be supplied in JSON data');
}

const RELATED_RECORDS: Record<string, string> = {
  customerId: 'customers',
  projectId: 'projects',
  quotationId: 'quotations',
};
const RELATED_PEOPLE = [
  'assigneeUserId',
  'projectManagerUserId',
  'salespersonUserId',
  'decidedBy',
  'memberUserIds',
];

@Injectable()
export class ResourcesService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Display names for linked records and colleagues. A linked record is only
   * described when the caller could read it directly (permission + scope).
   */
  async related(ctx: AuthContext, rows: { data: unknown; createdBy: string; updatedBy: string }[]) {
    const wanted: Record<string, Set<string>> = {};
    const people = new Set<string>();
    for (const row of rows) {
      const data = jsonObject(row.data);
      for (const [key, module] of Object.entries(RELATED_RECORDS))
        if (typeof data[key] === 'string') (wanted[module] ??= new Set()).add(data[key] as string);
      for (const key of RELATED_PEOPLE)
        for (const value of [data[key]].flat())
          if (typeof value === 'string') people.add(value);
      people.add(row.createdBy);
      people.add(row.updatedBy);
    }
    const records: Record<string, { module: string; name: string; number: string | null; status: string }> = {};
    for (const [module, idSet] of Object.entries(wanted)) {
      if (!can(ctx, `${module}.view`)) continue;
      const found = await this.db.businessRecord.findMany({
        where: { AND: [recordWhere(ctx, module), { id: { in: [...idSet] } }] },
        select: { id: true, module: true, name: true, number: true, status: true },
      });
      for (const r of found) records[r.id] = { module: r.module, name: r.name, number: r.number, status: r.status };
    }
    const members = people.size
      ? await this.db.organizationUser.findMany({
          where: { organizationId: ctx.organizationId, userId: { in: [...people] } },
          select: { userId: true, user: { select: { firstName: true, lastName: true } } },
        })
      : [];
    return {
      records,
      people: Object.fromEntries(members.map((m) => [m.userId, `${m.user.firstName} ${m.user.lastName}`])),
    };
  }

  async list(
    ctx: AuthContext,
    module: string,
    q: {
      page: number;
      limit: number;
      status?: string;
      search?: string;
      projectId?: string;
      customerId?: string;
      assignee?: string;
      branchId?: string;
    },
  ) {
    const statuses = q.status ? q.status.split(',') : [];
    statuses.forEach((s) => validateStatus(s));
    if (!Number.isInteger(q.page) || !Number.isInteger(q.limit))
      throw new BadRequestException('Invalid pagination');
    if (q.search && q.search.length > 100) throw new BadRequestException('Search is too long');
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const [key, value] of Object.entries({
      projectId: q.projectId,
      customerId: q.customerId,
      branchId: q.branchId,
    }))
      if (value !== undefined && !uuid.test(value)) throw new BadRequestException(`Invalid ${key}`);
    const assignee = q.assignee === 'me' ? ctx.userId : q.assignee;
    if (assignee !== undefined && !uuid.test(assignee)) throw new BadRequestException('Invalid assignee');
    const take = Math.min(Math.max(q.limit || 25, 1), 100),
      skip = (Math.max(q.page || 1, 1) - 1) * take;
    // Filters only ever narrow the caller's policy scope (first AND term).
    const where: Prisma.BusinessRecordWhereInput = {
      AND: [
        recordWhere(ctx, module),
        ...(statuses.length ? [{ status: { in: statuses as RecordStatus[] } }] : []),
        ...(q.branchId ? [{ branchId: q.branchId }] : []),
        ...(q.projectId ? [{ data: { path: ['projectId'], equals: q.projectId } }] : []),
        ...(q.customerId ? [{ data: { path: ['customerId'], equals: q.customerId } }] : []),
        ...(assignee ? [{ data: { path: ['assigneeUserId'], equals: assignee } }] : []),
        ...(q.search
          ? [
              {
                OR: [
                  { name: { contains: q.search, mode: 'insensitive' as const } },
                  { number: { contains: q.search, mode: 'insensitive' as const } },
                ],
              },
            ]
          : []),
      ],
    };
    const [data, total] = await this.db.$transaction([
      this.db.businessRecord.findMany({ where, take, skip, orderBy: { createdAt: 'desc' } }),
      this.db.businessRecord.count({ where }),
    ]);
    const projected = data.map((row) => projectRecord(ctx, row));
    return {
      data: projected,
      related: await this.related(ctx, projected),
      meta: {
        page: Math.floor(skip / take) + 1,
        limit: take,
        total,
        pages: Math.ceil(total / take),
      },
    };
  }

  async get(ctx: AuthContext, module: string, id: string) {
    const record = await this.db.businessRecord.findFirst({
      where: { AND: [recordWhere(ctx, module), { id }] },
    });
    if (!record) throw new NotFoundException('Record not found');
    const projected = projectRecord(ctx, record);
    return { ...projected, related: await this.related(ctx, [projected]) };
  }

  create(ctx: AuthContext, input: CreateInput & { status?: string }) {
    if (COMMAND_ONLY.has(input.module))
      throw new BadRequestException(`Create ${input.module} through its dedicated endpoint`);
    const data = input.data ?? {};
    validateDataState(data);
    validateRecordSchema(input.module, data);
    validateEmployeeWrite(ctx, input.module, data);
    validateSensitiveWrite(ctx, input.module, data);
    validateStatus(input.status);
    if (input.status && !STATUS_POLICY[input.module]?.create.includes(input.status))
      throw new BadRequestException('This status cannot be set when creating the record');
    if (NUMBER_FORMATS[input.module] && input.number)
      throw new BadRequestException('Numbers are assigned by Operix for this record type');
    const contracts = ctx.enabledModules.includes('contracts');
    if (
      input.module === 'projects' &&
      !contracts &&
      data.contractRequirement &&
      data.contractRequirement !== 'not_required'
    )
      throw new BadRequestException('Contract gates are unavailable while contracts are disabled');
    const assignment = assignmentPermission[input.module];
    if (
      assignment &&
      assignmentKeys.some(
        (key) =>
          key in data &&
          data[key] != null &&
          JSON.stringify(data[key]) !== JSON.stringify(ctx.userId) &&
          JSON.stringify(data[key]) !== JSON.stringify([ctx.userId]),
      )
    )
      requirePermissions(ctx, assignment);
    if (
      ctx.dataScope === 'customer' &&
      (input.module === 'customers' || !ctx.customerId || data.customerId !== ctx.customerId)
    )
      throw new ForbiddenException('Customer record scope required');
    return serializable(this.db, async (tx) => {
      const branchId = await parentBranch(tx, ctx, input.module, data, input.branchId);
      await validateBranch(tx, ctx, branchId);
      await validateRecordData(tx, ctx, input.module, data, branchId);
      const number = NUMBER_FORMATS[input.module]
        ? await nextNumber(tx, ctx.organizationId, input.module)
        : input.number;
      const record = await tx.businessRecord.create({
        data: {
          organizationId: ctx.organizationId,
          branchId,
          module: input.module,
          type: input.type,
          name: input.name.trim(),
          number,
          ...(input.status ? { status: input.status as RecordStatus } : {}),
          data: data as Prisma.InputJsonValue,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      });
      return projectRecord(ctx, record);
    });
  }

  update(ctx: AuthContext, module: string, id: string, input: UpdateInput) {
    if (COMMAND_ONLY.has(module))
      throw new BadRequestException(`Change ${module} through its dedicated endpoint`);
    validateStatus(input.status);
    if (input.status === 'ARCHIVED') throw new BadRequestException('Use the archive command');
    validateDataState(input.data ?? {});
    validateRecordSchema(module, input.data ?? {});
    validateEmployeeWrite(ctx, module, input.data ?? {});
    validateSensitiveWrite(ctx, module, input.data ?? {});
    const commandOnly = (COMMAND_FIELDS[module] ?? []).filter((key) => key in (input.data ?? {}));
    if (commandOnly.length)
      throw new BadRequestException(`${commandOnly.join(', ')} can only change through a status command`);
    if (module === 'tasks' && ctx.dataScope === 'self') {
      // Assignees report progress; planning fields stay with the planner.
      if (input.name !== undefined || input.data !== undefined)
        throw new ForbiddenException('You can only update the status of your tasks');
      if (input.status && !SELF_EDITABLE_TASK_STATUSES.includes(input.status))
        throw new ForbiddenException('You cannot set this task status');
    }
    return serializable(this.db, async (tx) => {
      const current = await tx.businessRecord.findFirst({
        where: { AND: [recordWhere(ctx, module), { id }] },
      });
      if (!current) throw new NotFoundException('Record not found');
      if (input.status && input.status !== current.status && protectedWorkflows.has(module))
        throw new BadRequestException('Protected state transition requires a domain command');
      if (
        input.status &&
        input.status !== current.status &&
        STATUS_POLICY[module] &&
        !STATUS_POLICY[module].update.includes(input.status)
      )
        throw new BadRequestException('This status is not allowed for this record type');
      const oldData = jsonObject(current.data);
      const parentField = PARENT_BRANCH[module]?.[0];
      if (
        module === 'tasks' &&
        parentField &&
        parentField in (input.data ?? {}) &&
        input.data![parentField] !== oldData[parentField]
      )
        throw new BadRequestException('A task cannot move to another project');
      if (parentField && input.data && parentField in input.data)
        await parentBranch(tx, ctx, module, input.data, current.branchId);
      if (
        module === 'projects' &&
        ['contractRequirement', 'depositRequired', 'depositAmount'].some(
          (key) =>
            key in (input.data ?? {}) &&
            JSON.stringify(input.data![key]) !== JSON.stringify(oldData[key]),
        )
      )
        throw new BadRequestException('Project gates cannot be changed through generic PATCH');
      if (
        assignmentKeys.some(
          (key) =>
            key in (input.data ?? {}) &&
            JSON.stringify(input.data![key]) !== JSON.stringify(oldData[key]),
        )
      ) {
        if (module === 'notifications' || ctx.dataScope === 'customer')
          throw new ForbiddenException('Ownership cannot be changed through generic PATCH');
        requirePermissions(
          ctx,
          assignmentPermission[module] ??
            (module === 'employees' ? 'employees.update' : 'customers.update'),
        );
        if (ctx.dataScope === 'self')
          throw new ForbiddenException('Self scope cannot reassign records');
      }
      if (
        ctx.dataScope === 'customer' &&
        'customerId' in (input.data ?? {}) &&
        input.data!.customerId !== ctx.customerId
      )
        throw new ForbiddenException('Customer ownership cannot change');
      // Merge, so submitting a visible employee profile cannot erase hidden fields
      // and omitting a project gate cannot silently remove it.
      const data = { ...oldData, ...input.data };
      if (input.data) await validateRecordData(tx, ctx, module, data, current.branchId);
      const record = await tx.businessRecord.update({
        where: { id },
        data: {
          name: input.name?.trim(),
          status: input.status as RecordStatus | undefined,
          ...(input.data ? { data: data as Prisma.InputJsonValue } : {}),
          updatedBy: ctx.userId,
        },
      });
      return projectRecord(ctx, record);
    });
  }

  archive(ctx: AuthContext, module: string, id: string) {
    return serializable(this.db, async (tx) => {
      const current = await tx.businessRecord.findFirst({
        where: { AND: [recordWhere(ctx, module), { id }] },
      });
      if (!current) throw new NotFoundException('Record not found');
      if (
        protectedWorkflows.has(module) &&
        !['DRAFT', 'CANCELLED', 'COMPLETED'].includes(current.status)
      )
        throw new BadRequestException('Finish or cancel the workflow before archiving');
      const record = await tx.businessRecord.update({
        where: { id },
        data: { archivedAt: new Date(), status: 'ARCHIVED', updatedBy: ctx.userId },
      });
      return projectRecord(ctx, record);
    });
  }
}
