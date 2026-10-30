import { z } from 'zod';
import {
  currencyCode,
  longText,
  mediumText,
  percentage,
  positiveAmount,
  quantity,
  shortText,
  tagsSchema,
  uuid,
  patchSchema,
} from './common';
import { CONTRACT_REQUIREMENTS } from './contracts';

export const PROJECT_STATUSES = [
  'draft',
  'awaiting_approval',
  'awaiting_contract',
  'awaiting_deposit',
  'ready_to_start',
  'in_progress',
  'on_hold',
  'waiting_for_customer',
  'under_review',
  'completed',
  'cancelled',
  'archived',
] as const;

export const projectSchema = z.object({
  name: shortText,
  customerId: uuid.nullish(),
  branchId: uuid.nullish(),
  serviceId: uuid.nullish(),
  quotationId: uuid.nullish(),
  kind: z
    .enum([
      'software',
      'marketing',
      'printing',
      'construction',
      'installation',
      'consulting',
      'internal',
      'other',
    ])
    .default('other'),
  description: longText.optional(),
  projectManagerUserId: uuid.nullish(),
  memberUserIds: z.array(uuid).max(200).default([]),
  startDate: z.coerce.date().nullish(),
  dueDate: z.coerce.date().nullish(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  budget: positiveAmount.optional(),
  currency: currencyCode.optional(),
  contractRequirement: z.enum(CONTRACT_REQUIREMENTS).default('not_required'),
  depositRequired: z.boolean().default(false),
  depositAmount: positiveAmount.optional(),
  tags: tagsSchema,
  notes: longText.optional(),
});
export const updateProjectSchema = patchSchema(projectSchema);

export const projectStatusSchema = z.object({
  status: z.enum(PROJECT_STATUSES),
  reason: mediumText.optional(),
  /** Required when the transition would be blocked by a contract or deposit gate. */
  overrideReason: z.string().trim().min(20).max(2000).optional(),
});

export const projectMemberSchema = z.object({
  userId: uuid,
  role: z.enum(['manager', 'member', 'reviewer', 'observer']).default('member'),
  allocationPercent: percentage.default(100),
});

export const milestoneSchema = z.object({
  name: shortText,
  description: mediumText.optional(),
  dueDate: z.coerce.date().nullish(),
  amount: positiveAmount.optional(),
  sortOrder: z.coerce.number().int().min(0).default(0),
  requiresCustomerApproval: z.boolean().default(false),
});

export const TASK_STATUSES = [
  'todo',
  'in_progress',
  'blocked',
  'in_review',
  'done',
  'cancelled',
] as const;

export const taskSchema = z.object({
  projectId: uuid.nullish(),
  workOrderId: uuid.nullish(),
  milestoneId: uuid.nullish(),
  title: shortText,
  description: longText.optional(),
  status: z.enum(TASK_STATUSES).default('todo'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  assigneeUserId: uuid.nullish(),
  dueDate: z.coerce.date().nullish(),
  estimatedHours: quantity.optional(),
  /** Tasks this one waits on. Cycles are rejected server-side. */
  dependsOnTaskIds: z.array(uuid).max(50).default([]),
  sortOrder: z.coerce.number().int().min(0).default(0),
  tags: tagsSchema,
});
export const updateTaskSchema = patchSchema(taskSchema);

export const taskCommentSchema = z.object({
  body: longText.min(1),
  /** Mentioned users receive an in-app notification. */
  mentionUserIds: z.array(uuid).max(30).default([]),
  attachmentDocumentIds: z.array(uuid).max(20).default([]),
});

export const timeEntrySchema = z
  .object({
    projectId: uuid.nullish(),
    taskId: uuid.nullish(),
    workOrderId: uuid.nullish(),
    startedAt: z.coerce.date(),
    endedAt: z.coerce.date().nullish(),
    hours: quantity.optional(),
    description: mediumText.optional(),
    billable: z.boolean().default(true),
  })
  .refine((v) => v.endedAt || v.hours, {
    message: 'Provide either an end time or a number of hours',
    path: ['hours'],
  })
  .refine((v) => !v.endedAt || v.endedAt > v.startedAt, {
    message: 'End time must be after the start time',
    path: ['endedAt'],
  });

export const clientApprovalSchema = z.object({
  title: shortText,
  description: mediumText.optional(),
  documentIds: z.array(uuid).min(1).max(30),
  dueDate: z.coerce.date().nullish(),
});

export const clientApprovalDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'changes_requested']),
  comment: longText.optional(),
});

// ---------------------------------------------------------------- work orders

export const WORK_ORDER_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'waiting_for_materials',
  'ready',
  'assigned',
  'in_progress',
  'quality_control',
  'ready_for_pickup',
  'ready_for_delivery',
  'delivered',
  'installed',
  'completed',
  'cancelled',
] as const;

export const workOrderSchema = z.object({
  projectId: uuid.nullish(),
  customerId: uuid.nullish(),
  branchId: uuid.nullish(),
  serviceId: uuid.nullish(),
  title: shortText,
  instructions: longText.optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  startDate: z.coerce.date().nullish(),
  dueDate: z.coerce.date().nullish(),
  assigneeUserIds: z.array(uuid).max(50).default([]),
  assetIds: z.array(uuid).max(20).default([]),
  estimatedLabourHours: quantity.optional(),
  requiredMaterials: z
    .array(
      z.object({
        inventoryItemId: uuid,
        quantity: quantity,
        unit: z.string().trim().max(24),
        notes: mediumText.optional(),
      }),
    )
    .max(200)
    .default([]),
  deliveryMethod: z.enum(['pickup', 'delivery', 'installation', 'digital']).default('pickup'),
  deliveryAddress: mediumText.optional(),
  tags: tagsSchema,
});
export const updateWorkOrderSchema = patchSchema(workOrderSchema);

export const workOrderStatusSchema = z.object({
  status: z.enum(WORK_ORDER_STATUSES),
  note: mediumText.optional(),
  overrideReason: z.string().trim().min(20).max(2000).optional(),
});

export const qualityCheckSchema = z.object({
  checklist: z
    .array(
      z.object({
        label: shortText,
        passed: z.boolean(),
        note: mediumText.optional(),
      }),
    )
    .min(1)
    .max(100),
  result: z.enum(['passed', 'failed', 'passed_with_remarks']),
  photoDocumentIds: z.array(uuid).max(20).default([]),
  notes: longText.optional(),
});

export const deliverySchema = z.object({
  deliveredAt: z.coerce.date().default(() => new Date()),
  receivedByName: shortText.optional(),
  signatureDocumentId: uuid.nullish(),
  photoDocumentIds: z.array(uuid).max(20).default([]),
  notes: mediumText.optional(),
  location: z
    .object({
      latitude: z.coerce.number().min(-90).max(90),
      longitude: z.coerce.number().min(-180).max(180),
    })
    .optional(),
});
