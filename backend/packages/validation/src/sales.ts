import { z } from 'zod';
import {
  currencyCode,
  decimalString,
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

export const serviceCategorySchema = z.object({
  name: shortText,
  description: mediumText.optional(),
  parentId: uuid.nullish(),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const serviceSchema = z.object({
  name: shortText,
  code: z.string().trim().max(40).optional(),
  categoryId: uuid.nullish(),
  description: longText.optional(),
  defaultPrice: positiveAmount,
  currency: currencyCode,
  unit: z.string().trim().max(24).default('piece'),
  taxable: z.boolean().default(true),
  taxRate: percentage.default(0),
  estimatedDurationMinutes: z.coerce.number().int().min(0).max(1_000_000).nullish(),
  departmentId: uuid.nullish(),
  contractRequirement: z
    .enum([
      'not_required',
      'before_work_starts',
      'before_production',
      'before_material_issue',
      'before_delivery',
      'before_installation',
    ])
    .default('not_required'),
  depositRequired: z.boolean().default(false),
  depositPercent: percentage.default(0),
  approvalRequired: z.boolean().default(false),
  requiredMaterials: z
    .array(
      z.object({
        inventoryItemId: uuid,
        quantity: quantity,
        unit: z.string().trim().max(24),
      }),
    )
    .max(100)
    .default([]),
  branchIds: z.array(uuid).default([]),
  isActive: z.boolean().default(true),
  tags: tagsSchema,
});
export const updateServiceSchema = patchSchema(serviceSchema);

/**
 * A quotation line may reference a catalog service, an inventory item, or be
 * fully ad hoc. Totals are recomputed server-side from these inputs; anything
 * the client sends as a total is ignored.
 */
export const quotationItemSchema = z.object({
  serviceId: uuid.nullish(),
  inventoryItemId: uuid.nullish(),
  description: shortText,
  details: mediumText.optional(),
  quantity: quantity.refine((v) => Number(v) > 0, 'Quantity must be greater than zero'),
  unit: z.string().trim().max(24).default('piece'),
  unitPrice: positiveAmount,
  discountPercent: percentage.default(0),
  discountAmount: positiveAmount.default('0'),
  taxRate: percentage.default(0),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const quotationSchema = z.object({
  customerId: uuid,
  branchId: uuid.nullish(),
  leadId: uuid.nullish(),
  title: shortText,
  currency: currencyCode,
  issueDate: z.coerce.date().default(() => new Date()),
  expiresAt: z.coerce.date().nullish(),
  items: z.array(quotationItemSchema).min(1, 'A quotation needs at least one line'),
  /** Applied after line-level discounts. */
  globalDiscountPercent: percentage.default(0),
  globalDiscountAmount: positiveAmount.default('0'),
  depositRequired: z.boolean().default(false),
  depositPercent: percentage.default(0),
  depositAmount: positiveAmount.optional(),
  paymentSchedule: z
    .array(
      z.object({
        label: shortText,
        percent: percentage.optional(),
        amount: positiveAmount.optional(),
        dueDate: z.coerce.date().nullish(),
        dueOnEvent: z
          .enum(['on_acceptance', 'on_start', 'on_delivery', 'on_completion', 'fixed_date'])
          .default('fixed_date'),
      }),
    )
    .max(24)
    .default([]),
  terms: longText.optional(),
  notes: longText.optional(),
  internalNotes: longText.optional(),
  tags: tagsSchema,
});
export const updateQuotationSchema = patchSchema(quotationSchema).omit({ customerId: true });

export const sendQuotationSchema = z.object({
  channels: z
    .array(z.enum(['email', 'sms', 'whatsapp', 'portal']))
    .min(1)
    .default(['email']),
  recipientEmails: z.array(z.string().email()).max(10).default([]),
  message: longText.optional(),
  attachPdf: z.boolean().default(true),
});

export const quotationDecisionSchema = z.object({
  decision: z.enum(['accept', 'reject', 'request_changes']),
  comment: longText.optional(),
  signatureName: shortText.optional(),
});

export const quotationApprovalSchema = z.object({
  approved: z.boolean(),
  comment: mediumText.optional(),
});

export const convertQuotationSchema = z.object({
  createProject: z.boolean().default(true),
  createInvoice: z.boolean().default(false),
  createContract: z.boolean().default(false),
  contractTemplateId: uuid.nullish(),
  projectName: shortText.optional(),
  projectManagerUserId: uuid.nullish(),
  dueDate: z.coerce.date().nullish(),
});

/** Server-side pricing result, echoed back so the UI can display a breakdown. */
export const pricingBreakdownSchema = z.object({
  subtotal: decimalString(),
  lineDiscountTotal: decimalString(),
  globalDiscountTotal: decimalString(),
  taxableBase: decimalString(),
  taxTotal: decimalString(),
  total: decimalString(),
  depositAmount: decimalString(),
  currency: currencyCode,
});
