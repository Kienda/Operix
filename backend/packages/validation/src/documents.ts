import { z } from 'zod';
import { longText, mediumText, shortText, tagsSchema, uuid } from './common';

export const DOCUMENT_CATEGORIES = [
  'customer_document',
  'contract',
  'signed_contract',
  'quotation',
  'invoice',
  'receipt',
  'payment_proof',
  'supplier_document',
  'purchase_order',
  'employee_document',
  'payslip',
  'incident_report',
  'design_file',
  'project_deliverable',
  'maintenance_record',
  'visitor_document',
  'branding',
  'other',
] as const;

/**
 * Uploads are two-phase: the client asks for a presigned URL, PUTs the bytes
 * straight to object storage, then confirms. The API never proxies file bytes.
 */
export const presignUploadSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine((v) => !v.includes('/') && !v.includes('\\'), 'File name must not contain a path')
    .refine((v) => !v.startsWith('.'), 'File name must not start with a dot'),
  mimeType: z.string().trim().min(3).max(180),
  sizeBytes: z.coerce.number().int().min(1),
  category: z.enum(DOCUMENT_CATEGORIES).default('other'),
  /** Optional link to the record this document belongs to. */
  entityType: z.string().trim().max(64).optional(),
  entityId: uuid.optional(),
  branchId: uuid.nullish(),
  folderId: uuid.nullish(),
  confidential: z.boolean().default(false),
});

export const confirmUploadSchema = z.object({
  uploadId: uuid,
  /** SHA-256 computed by the client; the API re-computes and compares. */
  sha256: z
    .string()
    .trim()
    .regex(/^[a-f0-9]{64}$/i, 'Must be a SHA-256 hex digest')
    .optional(),
  title: shortText.optional(),
  description: mediumText.optional(),
  tags: tagsSchema,
});

export const documentUpdateSchema = z.object({
  title: shortText.optional(),
  description: mediumText.optional(),
  category: z.enum(DOCUMENT_CATEGORIES).optional(),
  folderId: uuid.nullish(),
  tags: tagsSchema.optional(),
  confidential: z.boolean().optional(),
});

export const documentFolderSchema = z.object({
  name: shortText,
  parentId: uuid.nullish(),
  branchId: uuid.nullish(),
  description: mediumText.optional(),
});

export const documentShareSchema = z.object({
  customerId: uuid.nullish(),
  contactId: uuid.nullish(),
  expiresAt: z.coerce.date().nullish(),
  allowDownload: z.boolean().default(true),
  message: mediumText.optional(),
});

export const documentArchiveSchema = z.object({
  reason: z.string().trim().min(10).max(2000),
});

export const retentionRuleSchema = z.object({
  category: z.enum(DOCUMENT_CATEGORIES),
  retainDays: z.coerce.number().int().min(1).max(36_500),
  /** Financial and contract records are never hard-deleted, only archived. */
  action: z.enum(['archive', 'delete']).default('archive'),
  isActive: z.boolean().default(true),
});

// ------------------------------------------------------------ notifications

export const notificationTemplateSchema = z.object({
  eventKey: z.string().trim().min(3).max(64),
  channel: z.enum(['in_app', 'email', 'sms', 'whatsapp', 'push']),
  locale: z.enum(['en', 'fr']),
  subject: shortText.optional(),
  body: longText.min(1),
  /** Declared merge variables, validated against the body at save time. */
  variables: z.array(z.string().trim().max(64)).max(60).default([]),
  isActive: z.boolean().default(true),
});

export const notificationRoutingSchema = z.object({
  eventKey: z.string().trim().min(3).max(64),
  roleIds: z.array(uuid).max(60).default([]),
  userIds: z.array(uuid).max(200).default([]),
  channels: z.array(z.enum(['in_app', 'email', 'sms', 'whatsapp', 'push'])).default(['in_app']),
  /** Only fire when the record's amount exceeds this threshold. */
  minimumAmount: z.string().optional(),
  isActive: z.boolean().default(true),
});

export const notificationPreferenceSchema = z.object({
  inApp: z.boolean().optional(),
  email: z.boolean().optional(),
  sms: z.boolean().optional(),
  whatsapp: z.boolean().optional(),
  push: z.boolean().optional(),
  mutedEvents: z.array(z.string().trim().max(64)).max(200).optional(),
  quietHoursStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullish(),
  quietHoursEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullish(),
});

export const manualNotificationSchema = z.object({
  channels: z.array(z.enum(['in_app', 'email', 'sms', 'whatsapp', 'push'])).min(1),
  customerId: uuid.nullish(),
  userIds: z.array(uuid).max(200).default([]),
  subject: shortText.optional(),
  body: longText.min(1),
  attachmentDocumentIds: z.array(uuid).max(10).default([]),
});

export const markReadSchema = z.object({
  notificationIds: z.array(uuid).max(500).default([]),
  all: z.boolean().default(false),
});
