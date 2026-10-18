import { parseEnv, type Env } from './env';

/**
 * Shape the flat environment into grouped, typed configuration objects that
 * NestJS providers and the worker consume. Nothing else in the codebase reads
 * `process.env` directly.
 */

export interface AppConfig {
  env: Env['NODE_ENV'];
  name: string;
  appUrl: string;
  apiUrl: string;
  port: number;
  prefix: string;
  version: string;
  logLevel: Env['LOG_LEVEL'];
  isProduction: boolean;
  isTest: boolean;
}

export interface DatabaseConfig {
  url: string;
  appUrl: string;
  poolSize: number;
  ssl: boolean;
}

export interface RedisConfig {
  url: string;
  prefix: string;
  concurrency: number;
}

export interface AuthConfig {
  accessSecret: string;
  refreshSecret: string;
  accessTtl: number;
  refreshTtl: number;
  issuer: string;
  audience: string;
  mfaIssuer: string;
  passwordResetTtl: number;
  invitationTtl: number;
  portalTokenTtl: number;
  argon2: { memoryCost: number; timeCost: number; parallelism: number };
  maxFailedLogins: number;
  lockoutMinutes: number;
}

export interface SecurityConfig {
  corsOrigins: string[];
  rateLimit: { ttl: number; max: number; authMax: number };
  encryptionKey: string;
  trustProxy: number;
}

export interface StorageConfig {
  driver: 's3' | 'local';
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle: boolean;
  presignTtl: number;
  localPath: string;
  maxUploadBytes: number;
  allowedMimeTypes: string[];
  malwareScan: { enabled: boolean; host: string; port: number };
}

export interface MessagingConfig {
  mail: {
    driver: Env['MAIL_DRIVER'];
    from: string;
    resendApiKey?: string;
    smtp: { host?: string; port: number; user?: string; password?: string };
  };
  sms: { driver: Env['SMS_DRIVER']; accountSid?: string; authToken?: string; from?: string };
  whatsapp: { driver: Env['WHATSAPP_DRIVER']; phoneNumberId?: string; accessToken?: string };
  push: { driver: Env['PUSH_DRIVER']; accessToken?: string };
}

export interface DocumentsConfig {
  engine: 'pdfkit';
  verifyBaseUrl: string;
  retentionDays: number;
}

export interface GeoConfig {
  provider: Env['MAPS_PROVIDER'];
  mapboxToken?: string;
  googleMapsApiKey?: string;
  defaultGeofenceRadiusM: number;
  maxAccuracyM: number;
}

export interface ObservabilityConfig {
  sentryDsn?: string;
  otelEndpoint?: string;
  serviceName: string;
  metricsEnabled: boolean;
}

export interface SeedConfig {
  platformAdminEmail: string;
  platformAdminPassword: string;
  demoData: boolean;
}

export interface OperixConfig {
  app: AppConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  auth: AuthConfig;
  security: SecurityConfig;
  storage: StorageConfig;
  messaging: MessagingConfig;
  documents: DocumentsConfig;
  geo: GeoConfig;
  observability: ObservabilityConfig;
  seed: SeedConfig;
}

export function buildConfig(source: NodeJS.ProcessEnv = process.env): OperixConfig {
  const env = parseEnv(source);

  return {
    app: {
      env: env.NODE_ENV,
      name: env.APP_NAME,
      appUrl: env.APP_URL,
      apiUrl: env.API_URL,
      port: env.PORT,
      prefix: env.API_PREFIX,
      version: env.API_VERSION,
      logLevel: env.LOG_LEVEL,
      isProduction: env.NODE_ENV === 'production',
      isTest: env.NODE_ENV === 'test',
    },
    database: {
      url: env.DATABASE_URL,
      appUrl: env.DATABASE_APP_URL ?? env.DATABASE_URL,
      poolSize: env.DATABASE_POOL_SIZE,
      ssl: env.DATABASE_SSL,
    },
    redis: {
      url: env.REDIS_URL,
      prefix: env.REDIS_PREFIX,
      concurrency: env.QUEUE_CONCURRENCY,
    },
    auth: {
      accessSecret: env.JWT_ACCESS_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET,
      accessTtl: env.JWT_ACCESS_TTL,
      refreshTtl: env.JWT_REFRESH_TTL,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      mfaIssuer: env.MFA_ISSUER,
      passwordResetTtl: env.PASSWORD_RESET_TTL,
      invitationTtl: env.INVITATION_TTL,
      portalTokenTtl: env.PORTAL_TOKEN_TTL,
      argon2: {
        memoryCost: env.ARGON2_MEMORY_COST,
        timeCost: env.ARGON2_TIME_COST,
        parallelism: env.ARGON2_PARALLELISM,
      },
      maxFailedLogins: env.MAX_FAILED_LOGINS,
      lockoutMinutes: env.LOCKOUT_MINUTES,
    },
    security: {
      corsOrigins: env.CORS_ORIGINS,
      rateLimit: {
        ttl: env.RATE_LIMIT_TTL,
        max: env.RATE_LIMIT_MAX,
        authMax: env.AUTH_RATE_LIMIT_MAX,
      },
      encryptionKey: env.ENCRYPTION_KEY,
      trustProxy: env.TRUST_PROXY,
    },
    storage: {
      driver: env.STORAGE_DRIVER,
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      presignTtl: env.S3_PRESIGN_TTL,
      localPath: env.LOCAL_STORAGE_PATH,
      maxUploadBytes: env.MAX_UPLOAD_MB * 1024 * 1024,
      allowedMimeTypes: env.ALLOWED_UPLOAD_MIME,
      malwareScan: {
        enabled: env.MALWARE_SCAN_ENABLED,
        host: env.CLAMAV_HOST,
        port: env.CLAMAV_PORT,
      },
    },
    messaging: {
      mail: {
        driver: env.MAIL_DRIVER,
        from: env.MAIL_FROM,
        resendApiKey: env.RESEND_API_KEY,
        smtp: {
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          user: env.SMTP_USER,
          password: env.SMTP_PASSWORD,
        },
      },
      sms: {
        driver: env.SMS_DRIVER,
        accountSid: env.TWILIO_ACCOUNT_SID,
        authToken: env.TWILIO_AUTH_TOKEN,
        from: env.TWILIO_FROM,
      },
      whatsapp: {
        driver: env.WHATSAPP_DRIVER,
        phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
        accessToken: env.WHATSAPP_ACCESS_TOKEN,
      },
      push: { driver: env.PUSH_DRIVER, accessToken: env.EXPO_ACCESS_TOKEN },
    },
    documents: {
      engine: env.PDF_ENGINE,
      verifyBaseUrl: env.DOCUMENT_VERIFY_BASE_URL,
      retentionDays: env.DOCUMENT_RETENTION_DAYS,
    },
    geo: {
      provider: env.MAPS_PROVIDER,
      mapboxToken: env.MAPBOX_TOKEN,
      googleMapsApiKey: env.GOOGLE_MAPS_API_KEY,
      defaultGeofenceRadiusM: env.DEFAULT_GEOFENCE_RADIUS_M,
      maxAccuracyM: env.GPS_MAX_ACCURACY_M,
    },
    observability: {
      sentryDsn: env.SENTRY_DSN,
      otelEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
      serviceName: env.OTEL_SERVICE_NAME,
      metricsEnabled: env.METRICS_ENABLED,
    },
    seed: {
      platformAdminEmail: env.PLATFORM_ADMIN_EMAIL,
      platformAdminPassword: env.PLATFORM_ADMIN_PASSWORD,
      demoData: env.SEED_DEMO_DATA,
    },
  };
}
