import { randomBytes } from 'node:crypto';

/**
 * Validated runtime configuration. Production refuses to start with missing or
 * placeholder secrets instead of falling back to a value an attacker can know.
 */
export interface ApiConfig {
  production: boolean;
  jwtSecret: string;
  appUrl: string;
  corsOrigins: string[];
  trustProxy: number;
  sessionTtlDays: number;
  swaggerEnabled: boolean;
  requestLogging: boolean;
  /** Returned to the inviting administrator only outside production by default. */
  inviteLinkInResponse: boolean;
  /** Deployment-level module ceiling; empty means "use database enablement only". */
  moduleAllowlist: string[];
  mail: {
    driver: 'smtp' | 'log' | 'disabled';
    from: string;
    host?: string;
    port: number;
    secure: boolean;
    user?: string;
    password?: string;
  };
  rateLimit: { windowMs: number; perIdentity: number; perIp: number };
}

const PLACEHOLDERS = [/change[-_]?me/i, /dev-only/i, /^replace/i, /example/i, /^secret$/i];
const list = (value?: string) =>
  (value ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
const int = (value: string | undefined, fallback: number, name: string, min = 0) => {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min)
    throw new Error(`${name} must be an integer ≥ ${min}`);
  return parsed;
};
const bool = (value: string | undefined, fallback: boolean) =>
  value === undefined || value === ''
    ? fallback
    : ['1', 'true', 'yes'].includes(value.toLowerCase());

let cached: ApiConfig | undefined;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const production = env.NODE_ENV === 'production';
  const errors: string[] = [];

  let jwtSecret = env.JWT_ACCESS_SECRET ?? '';
  if (!jwtSecret || jwtSecret.length < 32 || PLACEHOLDERS.some((p) => p.test(jwtSecret))) {
    if (production)
      errors.push('JWT_ACCESS_SECRET must be a random value of at least 32 characters');
    // Development without a secret: a per-process random key, never a known constant.
    else jwtSecret = jwtSecret.length >= 32 ? jwtSecret : randomBytes(48).toString('hex');
  }
  if (production && !env.DATABASE_URL) errors.push('DATABASE_URL is required');

  const appUrl = (env.APP_URL ?? 'http://localhost:5173').replace(/\/+$/, '');
  if (production && !appUrl.startsWith('https://')) errors.push('APP_URL must be an https:// URL');

  const corsOrigins = list(env.CORS_ORIGINS);
  if (production && corsOrigins.some((o) => !o.startsWith('https://')))
    errors.push('CORS_ORIGINS must only contain https:// origins in production');

  const driver = (env.MAIL_DRIVER ?? (production ? 'smtp' : 'log')) as ApiConfig['mail']['driver'];
  if (!['smtp', 'log', 'disabled'].includes(driver))
    errors.push('MAIL_DRIVER must be smtp, log or disabled');
  if (production && driver !== 'smtp')
    errors.push('MAIL_DRIVER=smtp is required in production (invitations and resets are emailed)');
  if (driver === 'smtp' && !env.SMTP_HOST)
    errors.push('SMTP_HOST is required for MAIL_DRIVER=smtp');
  if (driver === 'smtp' && production) {
    for (const key of ['SMTP_USER', 'SMTP_PASSWORD', 'MAIL_FROM'])
      if (!env[key]?.trim()) errors.push(`${key} is required for SMTP`);
  }
  if (
    driver === 'smtp' &&
    env.SMTP_HOST === 'smtp.gmail.com' &&
    ((env.SMTP_PORT ?? '587') !== '587' || bool(env.SMTP_SECURE, false))
  )
    errors.push('Google SMTP requires port 587 and SMTP_SECURE=false for STARTTLS');

  let config: ApiConfig | undefined;
  try {
    config = {
      production,
      jwtSecret,
      appUrl,
      corsOrigins,
      trustProxy: int(env.TRUST_PROXY, production ? 1 : 0, 'TRUST_PROXY'),
      sessionTtlDays: int(env.SESSION_TTL_DAYS, 14, 'SESSION_TTL_DAYS', 1),
      swaggerEnabled: bool(env.SWAGGER_ENABLED, !production),
      requestLogging: bool(env.REQUEST_LOGGING, env.NODE_ENV !== 'test'),
      inviteLinkInResponse: bool(env.INVITE_LINK_IN_RESPONSE, !production),
      moduleAllowlist: list(env.OPERIX_MODULE_ALLOWLIST),
      mail: {
        driver,
        from: env.MAIL_FROM || 'Operix <no-reply@localhost>',
        host: env.SMTP_HOST || undefined,
        port: int(env.SMTP_PORT, 587, 'SMTP_PORT', 1),
        secure: bool(env.SMTP_SECURE, false),
        user: env.SMTP_USER || undefined,
        password: env.SMTP_PASSWORD || undefined,
      },
      rateLimit: {
        windowMs:
          int(env.AUTH_RATE_LIMIT_WINDOW_SECONDS, 900, 'AUTH_RATE_LIMIT_WINDOW_SECONDS', 1) * 1000,
        perIdentity: int(env.AUTH_RATE_LIMIT_PER_IDENTITY, 10, 'AUTH_RATE_LIMIT_PER_IDENTITY', 1),
        perIp: int(env.AUTH_RATE_LIMIT_PER_IP, 300, 'AUTH_RATE_LIMIT_PER_IP', 1),
      },
    };
  } catch (error) {
    errors.push((error as Error).message);
  }
  if (production && config && !config.moduleAllowlist.length)
    errors.push('OPERIX_MODULE_ALLOWLIST is required in production (e.g. core,crm,sales,projects)');
  if (errors.length || !config)
    throw new Error(`Invalid Operix configuration:\n - ${errors.join('\n - ')}`);
  return config;
}

export function config(): ApiConfig {
  cached ??= loadConfig();
  return cached;
}
