import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startStack } from './support/harness.mjs';

let stack;
beforeAll(async () => {
  stack = await startStack({ prefix: 'public_surface', env: { SWAGGER_ENABLED: 'false' } });
});
afterAll(async () => {
  await stack?.stop();
});

describe('public hostname API boundary', () => {
  for (const path of [
    '/auth/me',
    '/organization',
    '/organization/users',
    '/organization/invitations',
    '/organization/assignable-roles',
    '/organization/audit',
    '/workspace/dashboard',
    '/workspace/search?q=synthetic',
    '/records/customers',
    '/records/projects',
    '/records/tasks',
    '/records/quotations',
    '/platform/plans',
    '/platform/subscriptions',
  ]) {
    it(`requires authentication for GET ${path}`, async () => {
      const response = await fetch(`${stack.base}/api/v1${path}`);
      expect(response.status).toBe(401);
      expect(response.headers.get('set-cookie')).toBeNull(); // API uses explicit bearer credentials.
    });
  }
  for (const path of [
    '/auth/logout',
    '/auth/mfa/enroll',
    '/auth/mfa/confirm',
    '/auth/mfa/disable',
    '/records',
  ]) {
    it(`requires authentication for POST ${path}`, async () => {
      const response = await fetch(`${stack.base}/api/v1${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      expect(response.status).toBe(401);
    });
  }
  it('does not offer signup, docs or diagnostic routes', async () => {
    for (const path of ['/docs', '/docs-json', '/metrics', '/debug', '/api/v1/metrics'])
      expect((await fetch(stack.base + path)).status).toBe(404);
    for (const path of ['/api/v1/auth/register', '/api/v1/auth/signup'])
      expect((await fetch(stack.base + path, { method: 'POST' })).status).toBe(404);
  });
  it('does not grant a hostile browser origin credentialed CORS access', async () => {
    const response = await fetch(`${stack.base}/api/v1/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://attacker.invalid',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,authorization,x-organization-id',
      },
    });
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response.headers.get('access-control-allow-credentials')).toBeNull();
  });
});
