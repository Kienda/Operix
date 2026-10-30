import { z } from 'zod';
import {
  addressSchema,
  currencyCode,
  email,
  longText,
  mediumText,
  phone,
  positiveAmount,
  quantity,
  shortText,
  uuid,
  patchSchema,
} from './common';

export const departmentSchema = z.object({
  name: shortText,
  code: z.string().trim().max(24).optional(),
  branchId: uuid.nullish(),
  parentId: uuid.nullish(),
  managerEmployeeId: uuid.nullish(),
  isActive: z.boolean().default(true),
});

export const positionSchema = z.object({
  title: shortText,
  departmentId: uuid.nullish(),
  description: mediumText.optional(),
  level: z.enum(['intern', 'junior', 'mid', 'senior', 'lead', 'manager', 'director']).nullish(),
  isActive: z.boolean().default(true),
});

export const EMPLOYMENT_TYPES = [
  'full_time',
  'part_time',
  'contract',
  'temporary',
  'freelance',
  'intern',
  'remote',
  'shift_worker',
] as const;

export const SALARY_TYPES = [
  'monthly',
  'weekly',
  'biweekly',
  'hourly',
  'daily',
  'commission',
  'project_based',
  'mixed',
] as const;

export const employeeSchema = z.object({
  firstName: shortText,
  lastName: shortText,
  employeeNumber: z.string().trim().max(32).optional(),
  email: email.nullish(),
  phone: phone.nullish(),
  photoDocumentId: uuid.nullish(),
  address: addressSchema.optional(),
  emergencyContactName: shortText.nullish(),
  emergencyContactPhone: phone.nullish(),
  departmentId: uuid.nullish(),
  positionId: uuid.nullish(),
  branchId: uuid.nullish(),
  managerEmployeeId: uuid.nullish(),
  hireDate: z.coerce.date(),
  employmentType: z.enum(EMPLOYMENT_TYPES).default('full_time'),
  salaryType: z.enum(SALARY_TYPES).default('monthly'),
  baseSalary: positiveAmount.default('0'),
  currency: currencyCode,
  hourlyRate: positiveAmount.optional(),
  overtimeMultiplier: z.coerce.number().min(1).max(5).default(1.5),
  workScheduleId: uuid.nullish(),
  /** Encrypted at rest; only visible with `employees.view_sensitive`. */
  bankAccountName: shortText.nullish(),
  bankName: shortText.nullish(),
  bankAccountNumber: z.string().trim().max(64).nullish(),
  taxIdentifier: z.string().trim().max(64).nullish(),
  socialSecurityNumber: z.string().trim().max(64).nullish(),
  /** Free-form so no country's tax rules are hard-coded into the platform. */
  payrollProfile: z.record(z.string(), z.unknown()).default({}),
  status: z.enum(['active', 'on_leave', 'suspended', 'terminated']).default('active'),
  notes: longText.optional(),
  /** Creating a login for this employee is optional. */
  createUserAccount: z.boolean().default(false),
  roleIds: z.array(uuid).max(20).default([]),
});
export const updateEmployeeSchema = patchSchema(employeeSchema).omit({ createUserAccount: true });

export const offboardEmployeeSchema = z.object({
  terminationDate: z.coerce.date(),
  reason: z.enum(['resignation', 'end_of_contract', 'dismissal', 'retirement', 'other']),
  note: mediumText.optional(),
  revokeAccess: z.boolean().default(true),
  finalPayrollPeriodId: uuid.nullish(),
});

export const employeeDocumentSchema = z.object({
  documentId: uuid,
  kind: z.enum([
    'contract',
    'id_document',
    'certificate',
    'training',
    'medical',
    'disciplinary',
    'performance_review',
    'other',
  ]),
  title: shortText,
  issuedAt: z.coerce.date().nullish(),
  expiresAt: z.coerce.date().nullish(),
  confidential: z.boolean().default(true),
  notes: mediumText.optional(),
});

export const leaveTypeSchema = z.object({
  name: shortText,
  code: z.string().trim().max(24),
  paid: z.boolean().default(true),
  annualEntitlementDays: quantity.default('0'),
  carryOverDays: quantity.default('0'),
  requiresApproval: z.boolean().default(true),
  requiresDocument: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const leaveRequestSchema = z
  .object({
    leaveTypeId: uuid,
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    halfDayStart: z.boolean().default(false),
    halfDayEnd: z.boolean().default(false),
    reason: mediumText.optional(),
    documentIds: z.array(uuid).max(10).default([]),
  })
  .refine((v) => v.endDate >= v.startDate, {
    path: ['endDate'],
    message: 'End date must be on or after the start date',
  });

export const leaveDecisionSchema = z.object({
  approved: z.boolean(),
  comment: mediumText.optional(),
});

// ------------------------------------------------------------- attendance

export const workScheduleSchema = z.object({
  name: shortText,
  timeZone: z.string().trim().max(64),
  weeklyHours: quantity.default('40'),
  days: z
    .array(
      z.object({
        dayOfWeek: z.coerce.number().int().min(0).max(6),
        startsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        endsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        breakMinutes: z.coerce.number().int().min(0).max(480).default(0),
        working: z.boolean().default(true),
      }),
    )
    .max(7),
  isActive: z.boolean().default(true),
});

export const shiftSchema = z.object({
  name: shortText,
  branchId: uuid.nullish(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  requiredHeadcount: z.coerce.number().int().min(1).max(500).default(1),
  geofenceId: uuid.nullish(),
  patrolRouteId: uuid.nullish(),
  notes: mediumText.optional(),
  employeeIds: z.array(uuid).max(500).default([]),
});

/**
 * Field check-in. `deviceTime` is captured but never trusted — the server
 * timestamp is authoritative and a large skew is flagged.
 */
export const checkInSchema = z.object({
  shiftId: uuid.nullish(),
  branchId: uuid.nullish(),
  geofenceId: uuid.nullish(),
  deviceTime: z.coerce.date(),
  latitude: z.coerce.number().min(-90).max(90).nullish(),
  longitude: z.coerce.number().min(-180).max(180).nullish(),
  accuracyMeters: z.coerce.number().min(0).max(10_000).nullish(),
  address: mediumText.optional(),
  selfieDocumentId: uuid.nullish(),
  deviceId: z.string().trim().max(128).nullish(),
  networkType: z.enum(['wifi', 'cellular', 'offline', 'unknown']).default('unknown'),
  notes: mediumText.optional(),
  /** Idempotency key for replays from the offline queue. */
  syncKey: z.string().trim().min(8).max(128).optional(),
  capturedOffline: z.boolean().default(false),
});

export const checkOutSchema = checkInSchema.extend({
  attendanceRecordId: uuid.nullish(),
});

export const attendanceBreakSchema = z.object({
  action: z.enum(['start', 'end']),
  deviceTime: z.coerce.date(),
  reason: z.enum(['meal', 'rest', 'personal', 'other']).default('rest'),
  syncKey: z.string().trim().min(8).max(128).optional(),
});

export const attendanceAdjustmentSchema = z.object({
  checkInAt: z.coerce.date().nullish(),
  checkOutAt: z.coerce.date().nullish(),
  status: z
    .enum(['present', 'late', 'absent', 'early_departure', 'on_leave', 'holiday'])
    .optional(),
  reason: z.string().trim().min(10, 'An attendance correction needs a reason').max(2000),
});

export const attendanceApprovalSchema = z.object({
  approved: z.boolean(),
  approvedOvertimeHours: quantity.optional(),
  comment: mediumText.optional(),
});

// ---------------------------------------------------------------- payroll

export const payrollPeriodSchema = z
  .object({
    name: shortText,
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    payDate: z.coerce.date(),
    branchId: uuid.nullish(),
    currency: currencyCode,
  })
  .refine((v) => v.endDate > v.startDate, {
    path: ['endDate'],
    message: 'End date must be after the start date',
  });

export const payrollRunSchema = z.object({
  periodId: uuid,
  employeeIds: z.array(uuid).max(5000).default([]),
  includeOvertime: z.boolean().default(true),
  includeCommissions: z.boolean().default(true),
  includeReimbursements: z.boolean().default(true),
  notes: mediumText.optional(),
});

export const payrollAdjustmentSchema = z.object({
  employeeId: uuid,
  kind: z.enum(['earning', 'deduction']),
  code: z.enum([
    'bonus',
    'commission',
    'allowance',
    'benefit',
    'reimbursement',
    'overtime',
    'tax',
    'insurance',
    'leave_deduction',
    'late_deduction',
    'absence_deduction',
    'advance_repayment',
    'loan_repayment',
    'other',
  ]),
  label: shortText,
  amount: positiveAmount,
  taxable: z.boolean().default(true),
  note: mediumText.optional(),
});

export const payrollDecisionSchema = z.object({
  stage: z.enum(['hr_review', 'department_review', 'finance_approval', 'owner_approval']),
  approved: z.boolean(),
  comment: mediumText.optional(),
});

export const payrollPaymentSchema = z.object({
  method: z.enum(['bank_transfer', 'cash', 'check', 'mobile_money', 'other']),
  paidAt: z.coerce.date().default(() => new Date()),
  reference: shortText.nullish(),
  proofDocumentId: uuid.nullish(),
  employeeIds: z.array(uuid).max(5000).default([]),
});

export const employeeLoanSchema = z.object({
  employeeId: uuid,
  kind: z.enum(['loan', 'salary_advance']),
  principal: positiveAmount.refine((v) => Number(v) > 0, 'Amount must be greater than zero'),
  currency: currencyCode,
  installments: z.coerce.number().int().min(1).max(120).default(1),
  installmentAmount: positiveAmount.optional(),
  startPeriodId: uuid.nullish(),
  reason: mediumText,
});

export const loanDecisionSchema = z.object({
  approved: z.boolean(),
  comment: mediumText.optional(),
  installments: z.coerce.number().int().min(1).max(120).optional(),
});
