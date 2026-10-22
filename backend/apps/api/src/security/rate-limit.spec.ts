import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitGuard } from './rate-limit';

vi.mock('../platform/config', () => ({
  config: () => ({ rateLimit: { windowMs: 900_000, perIdentity: 2, perIp: 100 } }),
}));
vi.mock('../platform/logger', () => ({ logEvent: vi.fn() }));

describe('public login identity cooldown', () => {
  it('retains the identity budget across IPs and expires without disabling the account', () => {
    const clock = vi.spyOn(Date, 'now');
    const start = 1_800_000_000_000;
    clock.mockReturnValue(start);
    try {
      const reflector = new Reflector();
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue('login');
      const guard = new RateLimitGuard(reflector);
      const email = `synthetic-${randomUUID()}@operix.test`;
      const retry = vi.fn();
      const attempt = (ip: string, identity = email) =>
        guard.canActivate({
          getHandler: () => () => undefined,
          getClass: () => class {},
          switchToHttp: () => ({
            getRequest: () => ({ ip, body: { email: identity }, headers: {} }),
            getResponse: () => ({ setHeader: retry }),
          }),
        } as unknown as ExecutionContext);
      expect(attempt('192.0.2.1')).toBe(true);
      expect(attempt('192.0.2.2', email.toUpperCase())).toBe(true);
      expect(() => attempt('192.0.2.3')).toThrow('Too many attempts');
      expect(retry).toHaveBeenCalledWith('Retry-After', '900');
      expect(attempt('192.0.2.3', `other-${randomUUID()}@operix.test`)).toBe(true);
      clock.mockReturnValue(start + 900_001);
      expect(attempt('192.0.2.4')).toBe(true);
    } finally {
      clock.mockRestore();
    }
  });
});
