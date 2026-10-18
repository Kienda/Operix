import { z } from 'zod';

/** Primitives reused across every module's schemas. */

export const uuid = z.string().uuid('Must be a valid identifier');
export const optionalUuid = uuid.nullish();

export const shortText = z.string().trim().min(1).max(255);
export const mediumText = z.string().trim().max(1000);
export const longText = z.string().trim().max(20_000);

export const email = z.string().trim().toLowerCase().email().max(320);

/** E.164 with a tolerant local fallback for markets that dial nationally. */
export const phone = z
  .string()
  .trim()
  .min(6)
  .max(24)
  .regex(/^\+?[0-9 ()\-.]{6,24}$/, 'Must be a valid phone number');

export const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .length(3)
  .regex(/^[A-Z]{3}$/, 'Must be a 3-letter ISO 4217 code');

export const localeCode = z.enum(['en', 'fr']);

export const countryCode = z
  .string()
  .trim()
  .toUpperCase()
  .length(2)
  .regex(/^[A-Z]{2}$/, 'Must be a 2-letter ISO 3166-1 code');

export const timeZone = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'Must be a valid IANA time zone');

/**
 * Money arrives as a decimal string so no float ever touches a financial
 * value. The API converts to Prisma.Decimal at the service boundary.
 */
export const decimalString = (opts?: { min?: number; allowNegative?: boolean }) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === 'number' ? v.toString() : v.trim()))
    .refine((v) => /^-?\d{1,15}(\.\d{1,6})?$/.test(v), 'Must be a decimal number')
    .refine(
      (v) => (opts?.allowNegative ? true : !v.startsWith('-')),
      'Must not be negative',
    )
    .refine(
      (v) => (opts?.min === undefined ? true : Number(v) >= opts.min),
      `Must be at least ${opts?.min ?? 0}`,
    );

export const positiveAmount = decimalString({ min: 0 });
export const quantity = decimalString({ min: 0 });
export const percentage = z.coerce.number().min(0).max(100);

export const isoDate = z.coerce.date();
export const isoDateOptional = z.coerce.date().nullish();

export const geoPoint = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});

export const geoFix = geoPoint.extend({
  accuracyMeters: z.coerce.number().min(0).max(10_000),
  capturedAt: z.coerce.date(),
  altitude: z.coerce.number().nullish(),
  speed: z.coerce.number().nullish(),
  heading: z.coerce.number().min(0).max(360).nullish(),
});

export const addressSchema = z.object({
  line1: shortText.nullish(),
  line2: shortText.nullish(),
  city: shortText.nullish(),
  region: shortText.nullish(),
  postalCode: z.string().trim().max(20).nullish(),
  country: countryCode.nullish(),
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  search: z.string().trim().max(200).optional(),
  sortBy: z
    .string()
    .trim()
    .max(64)
    .regex(/^[a-zA-Z0-9_.]+$/, 'Invalid sort field')
    .optional(),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  branchId: uuid.optional(),
  status: z.string().trim().max(64).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type ListQueryInput = z.infer<typeof listQuerySchema>;

export const idParamSchema = z.object({ id: uuid });

/**
 * Any state change that bypasses a business rule must carry a written reason.
 * Reused by contract gate overrides, attendance corrections and payment
 * reversals.
 */
export const overrideReasonSchema = z.object({
  reason: z.string().trim().min(10, 'Provide a reason of at least 10 characters').max(2000),
});

export const tagsSchema = z.array(z.string().trim().min(1).max(48)).max(30).default([]);

export const metadataSchema = z.record(z.unknown()).default({});

/** Idempotency key supplied by the mobile app when replaying an offline queue. */
export const syncKey = z.string().trim().min(8).max(128);
