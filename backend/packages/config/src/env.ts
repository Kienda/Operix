import { z } from 'zod';

/**
 * Environment contract.
 *
 * The API and the worker both validate against this at boot and refuse to
 * start on a bad or missing value — a misconfigured secret must never degrade
 * silently into an insecure default.
 */

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const int = (fallback: number) =>
  z.coerce.number().int().default(fallback);

const csv = z
  .string()
  .default('')
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    APP_NAME: z.string().default('Operix'),
    APP_URL: z.string().url().default('http://localhost:3000'),
    API_URL: z.string().url().default('http://localhost:4000'),
    PORT: int(4000),
    API_PREFIX: z.string().default('api'),
    API_VERSION: z.string().default('v1'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    // database
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    DATABASE_APP_URL: z.string().optional(),
    DATABASE_POOL_SIZE: int(10),
    DATABASE_SSL: bool.default(false),

    // redis
    REDIS_URL: z.string().default('redis://localhost:6379'),
    REDIS_PREFIX: z.string().default('operix'),
    QUEUE_CONCURRENCY: int(5),

    // auth
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    JWT_ACCESS_TTL: int(900),
    JWT_REFRESH_TTL: int(2_592_000),
    JWT_ISSUER: z.string().default('operix'),
    JWT_AUDIENCE: z.string().default('operix-clients'),
    MFA_ISSUER: z.string().default('Operix'),
    PASSWORD_RESET_TTL: int(3600),
    INVITATION_TTL: int(604_800),
    PORTAL_TOKEN_TTL: int(86_400),
    ARGON2_MEMORY_COST: int(19_456),
    ARGON2_TIME_COST: int(2),
    ARGON2_PARALLELISM: int(1),

    // security
    CORS_ORIGINS: csv,
    RATE_LIMIT_TTL: int(60),
    RATE_LIMIT_MAX: int(120),
    AUTH_RATE_LIMIT_MAX: int(10),
    MAX_FAILED_LOGINS: int(5),
    LOCKOUT_MINUTES: int(15),
    ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY must be at least 32 characters'),
    TRUST_PROXY: int(1),

    // storage
    STORAGE_DRIVER: z.enum(['s3', 'local']).default('s3'),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().default('auto'),
    S3_BUCKET: z.string().default('operix-documents'),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: bool.default(true),
    S3_PRESIGN_TTL: int(900),
    LOCAL_STORAGE_PATH: z.string().default('./storage'),
    MAX_UPLOAD_MB: int(25),
    ALLOWED_UPLOAD_MIME: csv,
    MALWARE_SCAN_ENABLED: bool.default(false),
    CLAMAV_HOST: z.string().default('localhost'),
    CLAMAV_PORT: int(3310),

    // messaging
    MAIL_DRIVER: z.enum(['log', 'smtp', 'resend']).default('log'),
    MAIL_FROM: z.string().default('Operix <no-reply@operix.app>'),
    RESEND_API_KEY: z.string().optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: int(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMS_DRIVER: z.enum(['log', 'twilio']).default('log'),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_FROM: z.string().optional(),
    WHATSAPP_DRIVER: z.enum(['log', 'meta']).default('log'),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    WHATSAPP_ACCESS_TOKEN: z.string().optional(),
    PUSH_DRIVER: z.enum(['log', 'expo']).default('log'),
    EXPO_ACCESS_TOKEN: z.string().optional(),

    // documents
    PDF_ENGINE: z.enum(['pdfkit']).default('pdfkit'),
    DOCUMENT_VERIFY_BASE_URL: z.string().default('https://verify.operix.app'),
    DOCUMENT_RETENTION_DAYS: int(3650),

    // geo
    MAPS_PROVIDER: z.enum(['mapbox', 'google', 'none']).default('none'),
    MAPBOX_TOKEN: z.string().optional(),
    GOOGLE_MAPS_API_KEY: z.string().optional(),
    DEFAULT_GEOFENCE_RADIUS_M: int(150),
    GPS_MAX_ACCURACY_M: int(100),

    // observability
    SENTRY_DSN: z.string().optional(),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
    OTEL_SERVICE_NAME: z.string().default('operix-api'),
    METRICS_ENABLED: bool.default(true),

    // seed
    PLATFORM_ADMIN_EMAIL: z.string().email().default('admin@globalhightech.com'),
    PLATFORM_ADMIN_PASSWORD: z.string().default('ChangeMe!2026'),
    SEED_DEMO_DATA: bool.default(false),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_REFRESH_SECRET'],
          message: 'Access and refresh secrets must differ in production',
        });
      }
      if (env.JWT_ACCESS_SECRET.startsWith('replace-me')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_ACCESS_SECRET'],
          message: 'Placeholder secret detected in production',
        });
      }
      if (env.CORS_ORIGINS.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CORS_ORIGINS'],
          message: 'An explicit CORS allowlist is required in production',
        });
      }
      if (env.STORAGE_DRIVER === 'local') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['STORAGE_DRIVER'],
          message: 'Local disk storage is not permitted in production',
        });
      }
    }

    if (env.STORAGE_DRIVER === 's3' && (!env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['S3_ACCESS_KEY_ID'],
        message: 'S3 credentials are required when STORAGE_DRIVER=s3',
      });
    }

    if (env.MAIL_DRIVER === 'resend' && !env.RESEND_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RESEND_API_KEY'],
        message: 'RESEND_API_KEY is required when MAIL_DRIVER=resend',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n  - ${issues.join('\n  - ')}`);
    this.name = 'EnvValidationError';
  }
}

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    );
  }
  return result.data;
}
