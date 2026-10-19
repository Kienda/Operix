import { Controller, Get, Query, Req } from '@nestjs/common';
import { Prisma } from '@operix/database';
import { DatabaseService } from './database.module';
import type { AuthenticatedRequest } from '../security/request-context';
import {
  can,
  financialWhere,
  inventoryWhere,
  isOrganizationWide,
  recordWhere,
} from '../security/authorization';

const SEARCH_MODULES: Record<string, string> = {
  customers: 'customers.view',
  leads: 'leads.view',
  quotations: 'quotations.view',
  contracts: 'contracts.view',
  projects: 'projects.view',
  tasks: 'tasks.view',
  employees: 'employees.view',
  suppliers: 'suppliers.view',
  assets: 'assets.view',
  'work-orders': 'work_orders.view',
  'production-jobs': 'production.view',
  documents: 'documents.view',
};
@Controller('workspace')
export class WorkspaceController {
  constructor(private readonly db: DatabaseService) {}
  @Get('dashboard')
  async dashboard(@Req() req: AuthenticatedRequest) {
    const ctx = req.auth;
    const metrics: Array<{ key: string; label: string; value: number | string; kind: string }> = [];
    const own = ctx.dataScope === 'self';
    for (const [module, label, statuses] of [
      ['customers', 'Active customers', ['ACTIVE']],
      ['quotations', 'Quotations awaiting decision', ['PENDING']],
      ['projects', 'Projects in progress', ['ACTIVE', 'IN_PROGRESS']],
      [
        'tasks',
        own ? 'My open tasks' : 'Open tasks',
        ['DRAFT', 'PENDING', 'ACTIVE', 'IN_PROGRESS'],
      ],
    ] as const) {
      if (can(ctx, module + '.view'))
        metrics.push({
          key: module,
          label,
          value: await this.db.businessRecord.count({
            where: { AND: [recordWhere(ctx, module), { status: { in: [...statuses] } }] },
          }),
          kind: 'count',
        });
    }
    if (can(ctx, 'invoices.view') && can(ctx, 'balances.view')) {
      const invoices = await this.db.invoice.groupBy({
        by: ['currency'],
        where: { ...financialWhere(ctx), status: { not: 'CANCELLED' } },
        _sum: { total: true, paid: true },
      });
      for (const row of invoices)
        metrics.push({
          key: 'receivables-' + row.currency,
          label: 'Outstanding receivables',
          value:
            (row._sum.total ?? new Prisma.Decimal(0)).sub(row._sum.paid ?? 0).toFixed() +
            ' ' +
            row.currency,
          kind: 'text',
        });
    }
    if (can(ctx, 'payments.view')) {
      const payments = await this.db.payment.groupBy({
        by: ['currency'],
        where: { ...financialWhere(ctx), status: 'VERIFIED' },
        _sum: { amount: true },
      });
      for (const row of payments)
        metrics.push({
          key: 'payments-' + row.currency,
          label: 'Verified payments',
          value: (row._sum.amount ?? new Prisma.Decimal(0)).toFixed() + ' ' + row.currency,
          kind: 'text',
        });
    }
    if (can(ctx, 'inventory.view'))
      metrics.push({
        key: 'inventory',
        label: 'Inventory items',
        value: await this.db.inventoryItem.count({
          where: { ...inventoryWhere(ctx), status: 'ACTIVE' },
        }),
        kind: 'count',
      });
    if (can(ctx, 'attendance.view_own'))
      metrics.push({
        key: 'attendance',
        label: 'My attendance records',
        value: await this.db.businessRecord.count({
          where: { AND: [recordWhere(ctx, 'attendance'), { createdBy: ctx.userId }] },
        }),
        kind: 'count',
      });
    const activity = await this.db.auditLog.findMany({
      where: {
        organizationId: ctx.organizationId,
        ...(can(ctx, 'audit.view') && isOrganizationWide(ctx) ? {} : { userId: ctx.userId }),
      },
      select: { id: true, action: true, resource: true, resourceId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 8,
    });
    return { metrics, activity, generatedAt: new Date().toISOString() };
  }
  @Get('search')
  async search(@Query('q') raw: string | undefined, @Req() req: AuthenticatedRequest) {
    const query = raw?.trim();
    if (!query || query.length < 2) return { data: [] };
    const scopedModules = Object.entries(SEARCH_MODULES)
      .filter(([, permission]) => can(req.auth, permission))
      .map(([module]) => recordWhere(req.auth, module));
    if (!scopedModules.length) return { data: [] };
    const records = await this.db.businessRecord.findMany({
      where: {
        AND: [
          { OR: scopedModules },
          {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { number: { contains: query, mode: 'insensitive' } },
            ],
          },
        ],
      },
      select: { id: true, module: true, type: true, number: true, name: true, status: true },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });
    return { data: records };
  }
}
