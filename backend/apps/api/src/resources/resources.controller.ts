import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { AuthenticatedRequest } from '../security/request-context';
import { ResourcesService } from './resources.service';
import { can } from '../security/authorization';
import { moduleOfPermission, type ModuleKey } from '@operix/permissions';

const modules = [
  'customers',
  'leads',
  'services',
  'quotations',
  'contracts',
  'projects',
  'tasks',
  'work-orders',
  'expenses',
  'suppliers',
  'purchase-requests',
  'purchase-orders',
  'production-jobs',
  'employees',
  'leave-requests',
  'payroll-runs',
  'geofences',
  'patrols',
  'checkpoints',
  'incidents',
  'visitors',
  'assets',
  'documents',
  'notifications',
  'reports',
  'milestones',
  'guard-assignments',
];
const modulePermissions: Record<
  string,
  { view: string[]; create: string[]; update: string[]; archive: string[] }
> = {
  milestones: {
    view: ['projects.view'],
    create: ['milestones.manage'],
    update: ['milestones.manage'],
    archive: ['milestones.manage'],
  },
  'guard-assignments': {
    view: ['security.assignments.manage'],
    create: ['security.assignments.manage'],
    update: ['security.assignments.manage'],
    archive: ['security.assignments.manage'],
  },
  customers: {
    view: ['customers.view'],
    create: ['customers.create'],
    update: ['customers.update'],
    archive: ['customers.archive'],
  },
  leads: {
    view: ['leads.view'],
    create: ['leads.create'],
    update: ['leads.update'],
    archive: ['leads.archive'],
  },
  services: {
    view: ['services.view'],
    create: ['services.manage'],
    update: ['services.manage'],
    archive: ['services.manage'],
  },
  quotations: {
    view: ['quotations.view'],
    create: ['quotations.create'],
    update: ['quotations.create'],
    archive: ['quotations.cancel'],
  },
  contracts: {
    view: ['contracts.view'],
    create: ['contracts.create'],
    update: ['contracts.update'],
    archive: ['contracts.void'],
  },
  projects: {
    view: ['projects.view'],
    create: ['projects.create'],
    update: ['projects.update'],
    archive: ['projects.archive'],
  },
  tasks: {
    view: ['tasks.view'],
    create: ['tasks.create'],
    update: ['tasks.update'],
    archive: ['tasks.delete'],
  },
  'work-orders': {
    view: ['work_orders.view'],
    create: ['work_orders.create'],
    update: ['work_orders.update'],
    archive: ['work_orders.cancel'],
  },
  expenses: {
    view: ['expenses.view'],
    create: ['expenses.create'],
    update: ['expenses.approve'],
    archive: ['expenses.approve'],
  },
  suppliers: {
    view: ['suppliers.view'],
    create: ['suppliers.manage'],
    update: ['suppliers.manage'],
    archive: ['suppliers.manage'],
  },
  'purchase-requests': {
    view: ['purchase_requests.view'],
    create: ['purchase_requests.create'],
    update: ['purchase_requests.approve'],
    archive: ['purchase_requests.approve'],
  },
  'purchase-orders': {
    view: ['purchase_orders.view'],
    create: ['purchase_orders.create'],
    update: ['purchase_orders.create'],
    archive: ['purchase_orders.create'],
  },
  'production-jobs': {
    view: ['production.view'],
    create: ['production.manage_queue'],
    update: ['production.execute'],
    archive: ['production.manage_queue'],
  },
  employees: {
    view: ['employees.view'],
    create: ['employees.create'],
    update: ['employees.update'],
    archive: ['employees.offboard'],
  },
  'leave-requests': {
    view: ['leave.view'],
    create: ['leave.request'],
    update: ['leave.approve'],
    archive: ['leave.approve'],
  },
  'payroll-runs': {
    view: ['payroll.view'],
    create: ['payroll.process'],
    update: ['payroll.review'],
    archive: ['payroll.lock'],
  },
  geofences: {
    view: ['attendance.view'],
    create: ['security.geofences.manage'],
    update: ['security.geofences.manage'],
    archive: ['security.geofences.manage'],
  },
  patrols: {
    view: ['security.patrols.view'],
    create: ['security.patrols.manage'],
    update: ['security.patrols.manage'],
    archive: ['security.patrols.manage'],
  },
  checkpoints: {
    view: ['security.patrols.view'],
    create: ['security.patrols.manage'],
    update: ['security.patrols.manage'],
    archive: ['security.patrols.manage'],
  },
  incidents: {
    view: ['security.incidents.view'],
    create: ['security.incidents.create'],
    update: ['security.incidents.manage'],
    archive: ['security.incidents.manage'],
  },
  visitors: {
    view: ['security.visitors.view'],
    create: ['security.visitors.register'],
    update: ['security.visitors.register'],
    archive: ['security.visitors.register'],
  },
  assets: {
    view: ['assets.view'],
    create: ['assets.manage'],
    update: ['assets.manage'],
    archive: ['assets.dispose'],
  },
  documents: {
    view: ['documents.view'],
    create: ['documents.upload'],
    update: ['documents.share'],
    archive: ['documents.archive'],
  },
  notifications: {
    view: ['notifications.view'],
    create: ['notifications.send_manual'],
    update: ['notifications.manage_routing'],
    archive: ['notifications.manage_routing'],
  },
  reports: {
    view: ['reports.view'],
    create: ['reports.build'],
    update: ['reports.build'],
    archive: ['reports.build'],
  },
};
class CreateRecordDto {
  @IsString() @IsIn(modules) module!: string;
  @IsString() @MaxLength(80) type!: string;
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(60) number?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsString() @MaxLength(30) status?: string;
  @IsOptional() @IsObject() data?: Record<string, unknown>;
}
class UpdateRecordDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(30) status?: string;
  @IsOptional() @IsObject() data?: Record<string, unknown>;
}

@ApiTags('Business modules')
@Controller('records')
export class ResourcesController {
  constructor(private readonly service: ResourcesService) {}
  private authorize(
    req: AuthenticatedRequest,
    module: string,
    action: 'view' | 'create' | 'update' | 'archive',
  ) {
    const required = modulePermissions[module]?.[action] ?? [];
    const owningModule = (
      module === 'geofences' ? 'security' : moduleOfPermission(required[0] ?? '')
    ) as ModuleKey;
    if (
      !required.length ||
      !req.auth.enabledModules.includes(owningModule) ||
      !required.some((permission) => can(req.auth, permission))
    )
      throw new ForbiddenException('You do not have permission to access this module');
  }
  @Get(':module') list(
    @Param('module') module: string,
    @Query('page') page = '1',
    @Query('limit') limit = '25',
    @Query('status') status: string | undefined,
    @Query('search') search: string | undefined,
    @Req() req: AuthenticatedRequest,
    @Query('projectId') projectId?: string,
    @Query('customerId') customerId?: string,
    @Query('assignee') assignee?: string,
    @Query('branchId') branchId?: string,
  ) {
    this.authorize(req, module, 'view');
    return this.service.list(req.auth, module, {
      page: +page,
      limit: +limit,
      status,
      search,
      projectId,
      customerId,
      assignee,
      branchId,
    });
  }
  @Get(':module/:id') get(
    @Param('module') module: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    this.authorize(req, module, 'view');
    return this.service.get(req.auth, module, id);
  }
  @Post() create(@Body() body: CreateRecordDto, @Req() req: AuthenticatedRequest) {
    this.authorize(req, body.module, 'create');
    return this.service.create(req.auth, body);
  }
  @Patch(':module/:id') update(
    @Param('module') module: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateRecordDto,
    @Req() req: AuthenticatedRequest,
  ) {
    this.authorize(req, module, 'update');
    return this.service.update(req.auth, module, id, body);
  }
  @Delete(':module/:id') archive(
    @Param('module') module: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    this.authorize(req, module, 'archive');
    return this.service.archive(req.auth, module, id);
  }
}
