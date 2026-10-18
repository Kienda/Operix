import { z } from 'zod';
import { countryCode, currencyCode, email, mediumText, shortText, timeZone, uuid } from './common';
import { password } from './auth';

export const subscriptionPlanSchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]*$/, 'Plan keys are lower_snake_case')
    .max(32),
  name: shortText,
  description: mediumText.optional(),
  tier: z.enum(['starter', 'professional', 'business', 'enterprise', 'internal']),
  monthlyPrice: z.string().default('0'),
  annualPrice: z.string().default('0'),
  currency: currencyCode.default('USD'),
  trialDays: z.coerce.number().int().min(0).max(365).default(14),
  limits: z.object({
    branches: z.coerce.number().int().min(1).max(100_000),
    users: z.coerce.number().int().min(1).max(1_000_000),
    customers: z.coerce.number().int().min(1).max(10_000_000).nullish(),
    storageGb: z.coerce.number().int().min(1).max(1_000_000),
    apiRequestsPerDay: z.coerce.number().int().min(0).nullish(),
  }),
  modules: z.array(z.string().trim().max(40)).min(1),
  features: z
    .object({
      whiteLabel: z.boolean().default(false),
      apiAccess: z.boolean().default(false),
      customDomain: z.boolean().default(false),
      dedicatedSupport: z.boolean().default(false),
      advancedAudit: z.boolean().default(false),
      dataMigration: z.boolean().default(false),
    })
    .default({}),
  isPublic: z.boolean().default(true),
  isActive: z.boolean().default(true),
});
export const updateSubscriptionPlanSchema = subscriptionPlanSchema.partial();

/** Platform Super Admin creating a tenant, including its first owner. */
export const createOrganizationSchema = z.object({
  legalName: shortText,
  displayName: shortText,
  companyCode: z
    .string()
    .trim()
    .toUpperCase()
    .min(2)
    .max(12)
    .regex(/^[A-Z0-9]+$/),
  country: countryCode,
  timeZone,
  defaultCurrency: currencyCode,
  defaultLocale: z.enum(['en', 'fr']).default('en'),
  planKey: z.string().trim().max(32),
  billingCycle: z.enum(['monthly', 'annual', 'custom']).default('monthly'),
  trialEndsAt: z.coerce.date().nullish(),
  owner: z.object({
    email,
    firstName: shortText,
    lastName: shortText,
    /** Omit to send an invitation instead of setting a password directly. */
    password: password.optional(),
  }),
  firstBranch: z
    .object({
      name: shortText,
      code: z.string().trim().toUpperCase().min(2).max(12),
      country: countryCode,
      timeZone,
      currency: currencyCode,
    })
    .optional(),
  industryPacks: z
    .array(z.enum(['printing', 'software_agency', 'marketing_agency', 'security', 'construction']))
    .max(5)
    .default([]),
  notes: mediumText.optional(),
});

export const organizationStatusSchema = z.object({
  status: z.enum(['pending', 'active', 'suspended', 'cancelled']),
  reason: z.string().trim().min(10).max(2000),
  /** Suspension can optionally keep read access alive for data export. */
  allowReadOnlyAccess: z.boolean().default(false),
});

export const assignSubscriptionSchema = z.object({
  planKey: z.string().trim().max(32),
  billingCycle: z.enum(['monthly', 'annual', 'custom']).default('monthly'),
  startsAt: z.coerce.date().default(() => new Date()),
  endsAt: z.coerce.date().nullish(),
  negotiatedPrice: z.string().optional(),
  currency: currencyCode.optional(),
  /** Per-tenant overrides on top of the plan's limits. */
  limitOverrides: z.record(z.coerce.number().int().min(0)).default({}),
  moduleOverrides: z.array(z.string().trim().max(40)).default([]),
  notes: mediumText.optional(),
});

export const featureFlagSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_.]*$/)
    .max(64),
  description: mediumText.optional(),
  enabledGlobally: z.boolean().default(false),
  enabledOrganizationIds: z.array(uuid).max(10_000).default([]),
  rolloutPercent: z.coerce.number().int().min(0).max(100).default(0),
});

/**
 * Support access is never implicit. A platform admin requests a time-boxed,
 * justified grant; every read under it is tagged with the grant id.
 */
export const supportAccessRequestSchema = z.object({
  organizationId: uuid,
  reason: z.string().trim().min(20, 'Justify the access request').max(2000),
  requestedMinutes: z.coerce.number().int().min(15).max(480).default(60),
  scope: z.enum(['read_only', 'read_write']).default('read_only'),
  ticketReference: shortText.optional(),
});

export const supportAccessDecisionSchema = z.object({
  approved: z.boolean(),
  comment: mediumText.optional(),
  grantedMinutes: z.coerce.number().int().min(15).max(480).optional(),
});

export const platformAdminSchema = z.object({
  email,
  firstName: shortText,
  lastName: shortText,
  roleKey: z.enum(['platform_super_admin', 'platform_support_admin']),
});
