import { z } from 'zod';
import {
  addressSchema,
  countryCode,
  currencyCode,
  email,
  localeCode,
  mediumText,
  phone,
  shortText,
  timeZone,
  uuid,
  patchSchema,
} from './common';

/**
 * Document numbering. Organizations control their own formats; the API only
 * enforces that a template contains a sequence placeholder so two documents
 * can never collide.
 */
export const numberingFormatSchema = z
  .object({
    documentType: z.enum([
      'quotation',
      'invoice',
      'proforma',
      'receipt',
      'refund',
      'credit_note',
      'contract',
      'project',
      'work_order',
      'purchase_order',
      'purchase_request',
      'payment',
      'expense',
      'payslip',
      'incident',
      'visitor',
    ]),
    /** e.g. `{ORG}-{BRANCH}-INV-{YYYY}-{SEQ:6}` */
    template: z
      .string()
      .trim()
      .min(3)
      .max(120)
      .refine((v) => /\{SEQ(?::\d+)?\}/.test(v), 'Template must contain a {SEQ} placeholder'),
    resetPolicy: z.enum(['never', 'yearly', 'monthly']).default('yearly'),
    /** Sequences may be scoped per branch so branches never fight over numbers. */
    scope: z.enum(['organization', 'branch']).default('branch'),
    startAt: z.coerce.number().int().min(1).default(1),
  })
  .strict();

export const organizationProfileSchema = z.object({
  legalName: shortText,
  displayName: shortText,
  companyCode: z
    .string()
    .trim()
    .toUpperCase()
    .min(2)
    .max(12)
    .regex(/^[A-Z0-9]+$/, 'Company code must be alphanumeric'),
  country: countryCode,
  timeZone,
  defaultCurrency: currencyCode,
  additionalCurrencies: z.array(currencyCode).max(10).default([]),
  defaultLocale: localeCode.default('en'),
  supportedLocales: z.array(localeCode).min(1).default(['en']),
  logoDocumentId: uuid.nullish(),
  brandPrimaryColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex colour')
    .nullish(),
  brandAccentColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullish(),
  registrationNumber: shortText.nullish(),
  taxNumber: shortText.nullish(),
  taxInclusivePricing: z.boolean().default(false),
  defaultTaxRate: z.coerce.number().min(0).max(100).default(0),
  phone: phone.nullish(),
  secondaryPhone: phone.nullish(),
  email: email.nullish(),
  website: z.string().trim().url().max(255).nullish(),
  socialLinks: z.record(z.string(), z.string().url()).default({}),
  address: addressSchema.optional(),
});

export const updateOrganizationSchema = patchSchema(organizationProfileSchema);

export const branchSchema = z.object({
  name: shortText,
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2)
    .max(12)
    .regex(/^[A-Z0-9-]+$/),
  country: countryCode,
  timeZone,
  currency: currencyCode,
  phone: phone.nullish(),
  email: email.nullish(),
  address: addressSchema.optional(),
  managerUserId: uuid.nullish(),
  isWarehouse: z.boolean().default(false),
  isProductionFacility: z.boolean().default(false),
  operatingHours: z
    .array(
      z.object({
        dayOfWeek: z.coerce.number().int().min(0).max(6),
        opensAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        closesAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        closed: z.boolean().default(false),
      }),
    )
    .max(7)
    .default([]),
  isActive: z.boolean().default(true),
});
export const updateBranchSchema = patchSchema(branchSchema);

export const inviteUserSchema = z.object({
  email,
  firstName: shortText,
  lastName: shortText,
  roleIds: z.array(uuid).min(1, 'Assign at least one role'),
  branchIds: z.array(uuid).default([]),
  employeeId: uuid.nullish(),
  locale: localeCode.default('en'),
  timeZone: timeZone.optional(),
  message: mediumText.optional(),
});

export const updateUserSchema = z.object({
  firstName: shortText.optional(),
  lastName: shortText.optional(),
  phone: phone.nullish(),
  locale: localeCode.optional(),
  timeZone: timeZone.optional(),
  avatarDocumentId: uuid.nullish(),
  roleIds: z.array(uuid).min(1).optional(),
  branchIds: z.array(uuid).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  requireMfa: z.boolean().optional(),
});

export const roleSchema = z.object({
  name: shortText,
  description: mediumText.optional(),
  dataScope: z.enum(['all', 'branch', 'assigned', 'self']).default('branch'),
  permissions: z.array(z.string().trim().min(1).max(80)).max(500).default([]),
});
export const updateRoleSchema = patchSchema(roleSchema);

export const permissionOverrideSchema = z.object({
  userId: uuid,
  permission: z.string().trim().min(1).max(80),
  effect: z.enum(['allow', 'deny']),
  expiresAt: z.coerce.date().nullish(),
  reason: z.string().trim().min(5).max(500),
});

export const moduleToggleSchema = z.object({
  modules: z.array(z.string().trim().min(1).max(40)).max(40),
});

export const organizationSettingsSchema = z.object({
  numbering: z.array(numberingFormatSchema).max(30).optional(),
  /** Contract requirement defaults applied to new projects. */
  contractPolicy: z
    .object({
      defaultRequirement: z.enum([
        'not_required',
        'before_work_starts',
        'before_production',
        'before_material_issue',
        'before_delivery',
        'before_installation',
      ]),
      allowOverride: z.boolean().default(true),
      overrideRequiresRole: z.array(uuid).default([]),
    })
    .optional(),
  depositPolicy: z
    .object({
      requireDepositByDefault: z.boolean().default(false),
      defaultDepositPercent: z.coerce.number().min(0).max(100).default(0),
    })
    .optional(),
  attendancePolicy: z
    .object({
      lateGraceMinutes: z.coerce.number().int().min(0).max(180).default(10),
      requireSelfie: z.boolean().default(false),
      requireGps: z.boolean().default(true),
      maxGpsAccuracyMeters: z.coerce.number().int().min(10).max(1000).default(100),
      outsideGeofenceBehaviour: z
        .enum(['reject', 'flag', 'require_approval'])
        .default('require_approval'),
      allowOfflineCapture: z.boolean().default(true),
      continuousTracking: z.boolean().default(false),
      locationRetentionDays: z.coerce.number().int().min(1).max(3650).default(180),
    })
    .optional(),
  approvalPolicy: z
    .object({
      paymentVerificationThreshold: z.string().optional(),
      expenseManagerThreshold: z.string().optional(),
      quotationDiscountLimitPercent: z.coerce.number().min(0).max(100).default(20),
    })
    .optional(),
  notificationDefaults: z
    .object({
      email: z.boolean().default(true),
      sms: z.boolean().default(false),
      whatsapp: z.boolean().default(false),
      push: z.boolean().default(true),
      inApp: z.boolean().default(true),
    })
    .optional(),
  fiscalYearStartMonth: z.coerce.number().int().min(1).max(12).optional(),
  industryPacks: z
    .array(z.enum(['printing', 'software_agency', 'marketing_agency', 'security', 'construction']))
    .max(5)
    .optional(),
});

export const exchangeRateSchema = z.object({
  fromCurrency: currencyCode,
  toCurrency: currencyCode,
  rate: z
    .union([z.string(), z.number()])
    .transform((v) => String(v))
    .refine((v) => Number(v) > 0, 'Rate must be greater than zero'),
  effectiveFrom: z.coerce.date(),
  source: shortText.default('manual'),
});
