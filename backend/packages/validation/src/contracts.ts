import { z } from 'zod';
import {
  longText,
  mediumText,
  positiveAmount,
  shortText,
  tagsSchema,
  uuid,
  patchSchema,
} from './common';

export const CONTRACT_REQUIREMENTS = [
  'not_required',
  'before_work_starts',
  'before_production',
  'before_material_issue',
  'before_delivery',
  'before_installation',
] as const;

/** Actions a contract requirement can block. Mirrors the product spec. */
export const GATED_ACTIONS = [
  'start_project',
  'start_production',
  'issue_materials',
  'schedule_installation',
  'deliver_files',
  'close_project',
] as const;
export type GatedAction = (typeof GATED_ACTIONS)[number];

export const contractTemplateSchema = z.object({
  name: shortText,
  kind: z.enum([
    'general_service',
    'website_development',
    'software_development',
    'digital_marketing',
    'graphic_design',
    'printing',
    'installation',
    'maintenance',
    'monthly_retainer',
    'nda',
    'employment',
    'supplier',
    'custom',
  ]),
  locale: z.enum(['en', 'fr']).default('en'),
  /** Handlebars-style body. Placeholders are resolved server-side only. */
  body: z.string().min(50).max(500_000),
  /** Declared merge fields; the builder validates the body against these. */
  fields: z
    .array(
      z.object({
        key: z
          .string()
          .trim()
          .regex(/^[a-z][a-z0-9_.]*$/, 'Field keys are lower_snake_case'),
        label: shortText,
        type: z.enum(['text', 'number', 'date', 'currency', 'boolean', 'multiline']),
        required: z.boolean().default(false),
        defaultValue: z.string().max(500).nullish(),
      }),
    )
    .max(80)
    .default([]),
  requiresCountersignature: z.boolean().default(true),
  defaultDurationDays: z.coerce.number().int().min(0).max(3650).nullish(),
  autoRenew: z.boolean().default(false),
  renewalNoticeDays: z.coerce.number().int().min(0).max(365).default(30),
  isActive: z.boolean().default(true),
});
export const updateContractTemplateSchema = patchSchema(contractTemplateSchema);

export const contractSchema = z.object({
  templateId: uuid.nullish(),
  customerId: uuid,
  branchId: uuid.nullish(),
  projectId: uuid.nullish(),
  quotationId: uuid.nullish(),
  title: shortText,
  /** Values for the template merge fields. */
  fieldValues: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .default({}),
  amount: positiveAmount.optional(),
  currency: z.string().trim().length(3).optional(),
  startDate: z.coerce.date().nullish(),
  endDate: z.coerce.date().nullish(),
  autoRenew: z.boolean().default(false),
  renewalNoticeDays: z.coerce.number().int().min(0).max(365).default(30),
  requirement: z.enum(CONTRACT_REQUIREMENTS).default('not_required'),
  gatedActions: z.array(z.enum(GATED_ACTIONS)).default([]),
  notes: longText.optional(),
  tags: tagsSchema,
});
export const updateContractSchema = patchSchema(contractSchema).omit({ customerId: true });

export const contractApprovalSchema = z.object({
  approved: z.boolean(),
  comment: mediumText.optional(),
});

export const sendContractSchema = z.object({
  channels: z
    .array(z.enum(['email', 'whatsapp', 'portal']))
    .min(1)
    .default(['email']),
  recipientEmails: z.array(z.string().email()).max(10).default([]),
  message: longText.optional(),
  signatureDeadline: z.coerce.date().nullish(),
});

/**
 * Uploading a signed copy never mutates an existing version — it always
 * creates a new one and preserves the previous file and its hash.
 */
export const uploadSignedContractSchema = z.object({
  documentId: uuid,
  signedAt: z.coerce.date(),
  signedByName: shortText,
  signedByTitle: shortText.optional(),
  /** Set when a staff member uploads on behalf of the customer. */
  uploadedOnBehalfOfCustomer: z.boolean().default(false),
  notes: mediumText.optional(),
});

export const countersignSchema = z.object({
  signedByName: shortText,
  signedByTitle: shortText.optional(),
  signatureDocumentId: uuid.nullish(),
  signedAt: z.coerce.date().default(() => new Date()),
  notes: mediumText.optional(),
});

export const contractAmendmentSchema = z.object({
  type: z.enum(['amendment', 'addendum', 'change_order']),
  title: shortText,
  body: z.string().min(20).max(500_000),
  amountDelta: z.string().optional(),
  effectiveDate: z.coerce.date(),
  reason: mediumText,
});

export const voidContractSchema = z.object({
  reason: z.string().trim().min(10).max(2000),
});

/**
 * Overriding a contract gate is deliberately heavy: a written reason, the
 * acting user and a timestamp all land in the audit log.
 */
export const gateOverrideSchema = z.object({
  action: z.enum(GATED_ACTIONS),
  reason: z.string().trim().min(20, 'Explain the override in at least 20 characters').max(2000),
  expiresAt: z.coerce.date().nullish(),
});
