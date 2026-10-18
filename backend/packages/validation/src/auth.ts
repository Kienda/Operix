import { z } from 'zod';
import { email, localeCode, shortText, timeZone, uuid } from './common';

/**
 * Password policy: length does the heavy lifting, with a light composition
 * check to block the obvious. Argon2id handles the rest.
 */
export const password = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128)
  .refine((v) => /[a-z]/.test(v), 'Must contain a lowercase letter')
  .refine((v) => /[A-Z]/.test(v), 'Must contain an uppercase letter')
  .refine((v) => /[0-9]/.test(v), 'Must contain a digit')
  .refine(
    (v) => !/^(?:password|operix|welcome|123456|qwerty)/i.test(v),
    'Password is too predictable',
  );

export const deviceInfoSchema = z.object({
  deviceId: z.string().trim().min(4).max(128),
  name: shortText.optional(),
  platform: z.enum(['web', 'ios', 'android', 'other']).default('web'),
  model: shortText.optional(),
  osVersion: shortText.optional(),
  appVersion: shortText.optional(),
  pushToken: z.string().trim().max(255).optional(),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(128),
  /**
   * Optional. When a user belongs to several organizations the API returns the
   * list instead of a session, and the client re-submits with a choice.
   */
  organizationId: uuid.optional(),
  mfaCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'MFA code must be 6 digits')
    .optional(),
  recoveryCode: z.string().trim().min(8).max(64).optional(),
  device: deviceInfoSchema.optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(20),
  device: deviceInfoSchema.optional(),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(20).optional(),
  allDevices: z.boolean().default(false),
});

export const switchOrganizationSchema = z.object({
  organizationId: uuid,
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(20).max(512),
    password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    password,
    confirmPassword: z.string(),
    revokeOtherSessions: z.boolean().default(true),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })
  .refine((v) => v.password !== v.currentPassword, {
    path: ['password'],
    message: 'New password must differ from the current one',
  });

export const acceptInvitationSchema = z
  .object({
    token: z.string().min(20).max(512),
    firstName: shortText,
    lastName: shortText,
    password,
    confirmPassword: z.string(),
    locale: localeCode.default('en'),
    timeZone: timeZone.default('UTC'),
    device: deviceInfoSchema.optional(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export const mfaEnrolSchema = z.object({
  method: z.enum(['totp']).default('totp'),
});

export const mfaConfirmSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'MFA code must be 6 digits'),
});

export const mfaDisableSchema = z.object({
  password: z.string().min(1).max(128),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/)
    .optional(),
});

export const revokeSessionSchema = z.object({ sessionId: uuid });

/** Portal magic-link request issued to a customer contact. */
export const portalAccessRequestSchema = z.object({ email });

export const portalAccessConsumeSchema = z.object({
  token: z.string().min(20).max(512),
  device: deviceInfoSchema.optional(),
});
