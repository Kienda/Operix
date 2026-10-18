import { z } from 'zod';
import {
  addressSchema,
  countryCode,
  currencyCode,
  email,
  localeCode,
  longText,
  mediumText,
  phone,
  shortText,
  tagsSchema,
  uuid,
} from './common';

export const customerSchema = z.object({
  type: z.enum(['individual', 'company']).default('company'),
  name: shortText,
  companyName: shortText.nullish(),
  email: email.nullish(),
  phone: phone.nullish(),
  whatsappNumber: phone.nullish(),
  address: addressSchema.optional(),
  country: countryCode.nullish(),
  city: shortText.nullish(),
  taxNumber: shortText.nullish(),
  registrationNumber: shortText.nullish(),
  preferredLocale: localeCode.default('en'),
  preferredCurrency: currencyCode.optional(),
  branchId: uuid.nullish(),
  salespersonUserId: uuid.nullish(),
  projectManagerUserId: uuid.nullish(),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).default(0),
  creditLimit: z.string().optional(),
  notes: longText.optional(),
  tags: tagsSchema,
  status: z.enum(['active', 'inactive', 'archived']).default('active'),
});
export const updateCustomerSchema = customerSchema.partial();

export const customerContactSchema = z.object({
  firstName: shortText,
  lastName: shortText.nullish(),
  position: shortText.nullish(),
  email: email.nullish(),
  phone: phone.nullish(),
  whatsappNumber: phone.nullish(),
  isPrimary: z.boolean().default(false),
  /** Grants this contact portal access when enabled. */
  portalEnabled: z.boolean().default(false),
  notes: mediumText.optional(),
});

export const customerPreferencesSchema = z.object({
  preferredLocale: localeCode.optional(),
  preferredEmail: email.nullish(),
  preferredPhone: phone.nullish(),
  emailEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  whatsappEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
  /** Marketing is opt-in and tracked separately from transactional messages. */
  marketingConsent: z.boolean().optional(),
  mutedEvents: z.array(z.string().trim().max(64)).max(100).optional(),
});

export const LEAD_STAGES = [
  'new',
  'contacted',
  'qualified',
  'meeting_scheduled',
  'proposal_requested',
  'quotation_sent',
  'negotiation',
  'won',
  'lost',
  'archived',
] as const;

export const leadSchema = z.object({
  title: shortText,
  contactName: shortText,
  companyName: shortText.nullish(),
  email: email.nullish(),
  phone: phone.nullish(),
  source: z
    .enum([
      'website',
      'referral',
      'walk_in',
      'phone',
      'email',
      'social_media',
      'campaign',
      'partner',
      'exhibition',
      'other',
    ])
    .default('other'),
  stage: z.enum(LEAD_STAGES).default('new'),
  estimatedValue: z.string().optional(),
  currency: currencyCode.optional(),
  branchId: uuid.nullish(),
  assignedUserId: uuid.nullish(),
  serviceId: uuid.nullish(),
  followUpAt: z.coerce.date().nullish(),
  notes: longText.optional(),
  tags: tagsSchema,
});
export const updateLeadSchema = leadSchema.partial();

export const leadStageChangeSchema = z.object({
  stage: z.enum(LEAD_STAGES),
  reason: mediumText.optional(),
  lostReason: z
    .enum(['price', 'timeline', 'competitor', 'no_budget', 'no_response', 'other'])
    .optional(),
});

export const leadAssignSchema = z.object({
  assignedUserId: uuid,
  note: mediumText.optional(),
});

export const convertLeadSchema = z.object({
  createCustomer: z.boolean().default(true),
  existingCustomerId: uuid.nullish(),
  customer: customerSchema.partial().optional(),
  createQuotation: z.boolean().default(false),
});

export const activitySchema = z.object({
  type: z.enum(['note', 'call', 'meeting', 'email', 'whatsapp', 'task', 'visit']),
  subject: shortText,
  body: longText.optional(),
  occurredAt: z.coerce.date().default(() => new Date()),
  durationMinutes: z.coerce.number().int().min(0).max(1440).nullish(),
  outcome: z.enum(['positive', 'neutral', 'negative', 'no_answer']).nullish(),
  customerId: uuid.nullish(),
  leadId: uuid.nullish(),
  followUpAt: z.coerce.date().nullish(),
});
