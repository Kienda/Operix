import { z } from 'zod';
import { currencyCode, shortText, uuid, patchSchema } from './common';

export const REPORT_KEYS = [
  // sales
  'sales.summary',
  'sales.leads',
  'sales.conversion',
  'sales.quotations',
  'sales.won_lost',
  'sales.by_representative',
  'sales.by_service',
  'sales.by_branch',
  // finance
  'finance.revenue',
  'finance.payments',
  'finance.outstanding',
  'finance.expenses',
  'finance.cash_flow',
  'finance.refunds',
  'finance.profit_estimate',
  'finance.by_currency',
  'finance.branch_performance',
  // projects
  'projects.active',
  'projects.delayed',
  'projects.completed',
  'projects.profitability',
  'projects.team_workload',
  // inventory
  'inventory.current_stock',
  'inventory.low_stock',
  'inventory.consumption',
  'inventory.valuation',
  'inventory.movements',
  'inventory.waste',
  'inventory.supplier_purchases',
  // production
  'production.jobs_completed',
  'production.time',
  'production.machine_usage',
  'production.rework',
  'production.delivery_performance',
  // hr and payroll
  'hr.headcount',
  'hr.attendance',
  'hr.overtime',
  'hr.absences',
  'hr.leave',
  'payroll.cost',
  'payroll.benefits',
  'payroll.deductions',
  'payroll.by_department',
  // security
  'security.guard_attendance',
  'security.patrol_completion',
  'security.missed_checkpoints',
  'security.incidents',
  'security.visitors',
  'security.geofence_violations',
] as const;

export type ReportKey = (typeof REPORT_KEYS)[number];

export const reportQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  branchIds: z.array(uuid).max(100).default([]),
  departmentIds: z.array(uuid).max(100).default([]),
  employeeIds: z.array(uuid).max(500).default([]),
  serviceIds: z.array(uuid).max(200).default([]),
  customerIds: z.array(uuid).max(500).default([]),
  /**
   * Reports never mix currencies implicitly. Either pick one, or the response
   * is grouped per currency with no cross-currency total.
   */
  currency: currencyCode.optional(),
  groupBy: z
    .enum(['day', 'week', 'month', 'quarter', 'year', 'branch', 'service', 'employee'])
    .default('month'),
  includeArchived: z.coerce.boolean().default(false),
});

export const reportExportSchema = reportQuerySchema.extend({
  format: z.enum(['pdf', 'xlsx', 'csv']),
  /** Large exports run in the worker and notify the requester when ready. */
  async: z.coerce.boolean().default(true),
  title: shortText.optional(),
});

export const savedReportSchema = z.object({
  name: shortText,
  reportKey: z.enum(REPORT_KEYS),
  filters: patchSchema(reportQuerySchema),
  isShared: z.boolean().default(false),
  scheduleCron: z
    .string()
    .trim()
    .max(64)
    .regex(/^[\d*/,\-\s]+$/, 'Invalid cron expression')
    .nullish(),
  recipients: z.array(z.string().email()).max(50).default([]),
});

export const dashboardQuerySchema = z.object({
  range: z.enum(['today', 'week', 'month', 'quarter', 'year', 'custom']).default('month'),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  branchId: uuid.optional(),
  currency: currencyCode.optional(),
  departmentId: uuid.optional(),
  employeeId: uuid.optional(),
  serviceId: uuid.optional(),
});

export const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  userId: uuid.optional(),
  action: z.string().trim().max(64).optional(),
  entityType: z.string().trim().max(64).optional(),
  entityId: uuid.optional(),
  branchId: uuid.optional(),
  correlationId: z.string().trim().max(64).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
