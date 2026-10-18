import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const production = {
  NODE_ENV: 'production',
  JWT_ACCESS_SECRET: 'a'.repeat(20) + 'Zq9vR2xL7mN4pK8sT1wY6bC3',
  DATABASE_URL: 'postgresql://operix_app:x@db:5432/operix',
  APP_URL: 'https://operix.example.org',
  CORS_ORIGINS: 'https://operix.example.org',
  MAIL_DRIVER: 'smtp',
  SMTP_HOST: 'email-smtp.us-east-1.amazonaws.com',
  OPERIX_MODULE_ALLOWLIST: 'core,crm,sales,projects',
};

describe('runtime configuration', () => {
  it('accepts a complete production configuration with secure defaults', () => {
    const config = loadConfig(production);
    expect(config.production).toBe(true);
    expect(config.swaggerEnabled).toBe(false);
    expect(config.inviteLinkInResponse).toBe(false);
    expect(config.trustProxy).toBe(1);
    expect(config.moduleAllowlist).toEqual(['core', 'crm', 'sales', 'projects']);
  });

  it.each([
    ['missing JWT secret', { JWT_ACCESS_SECRET: '' }, /JWT_ACCESS_SECRET/],
    ['placeholder JWT secret', { JWT_ACCESS_SECRET: 'dev-only-change-me-dev-only-change-me' }, /JWT_ACCESS_SECRET/],
    ['plain-http app URL', { APP_URL: 'http://operix.example.org' }, /APP_URL/],
    ['log-only email', { MAIL_DRIVER: 'log' }, /MAIL_DRIVER/],
    ['no module ceiling', { OPERIX_MODULE_ALLOWLIST: '' }, /OPERIX_MODULE_ALLOWLIST/],
    ['insecure CORS origin', { CORS_ORIGINS: 'http://evil.example' }, /CORS_ORIGINS/],
  ])('refuses to start with %s', (_name, override, message) => {
    expect(() => loadConfig({ ...production, ...override })).toThrow(message);
  });

  it('never falls back to a known JWT secret outside production', () => {
    const a = loadConfig({ NODE_ENV: 'development' }).jwtSecret;
    const b = loadConfig({ NODE_ENV: 'development' }).jwtSecret;
    expect(a).toHaveLength(96);
    expect(a).not.toBe(b);
  });
});
