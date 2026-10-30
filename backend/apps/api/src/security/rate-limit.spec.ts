import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitGuard, RateLimitStore } from './rate-limit';

const limits = vi.hoisted(() => ({ windowMs: 900_000, perIdentity: 2, perIp: 100 }));

vi.mock('../platform/config', () => ({
  config: () => ({ rateLimit: limits }),
}));
vi.mock('../platform/logger', () => ({ logEvent: vi.fn() }));

afterEach(() => {
  limits.perIp = 100;
  vi.restoreAllMocks();
});

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

  it('rejects a blocked IP before consuming another identity budget', () => {
    limits.perIp = 2;
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue('login');
    const guard = new RateLimitGuard(reflector);
    const retry = vi.fn();
    const email = `blocked-ip-${randomUUID()}@operix.test`;
    const freshEmail = `fresh-${randomUUID()}@operix.test`;
    const attempt = (ip: string, identity: string) =>
      guard.canActivate({
        getHandler: () => () => undefined,
        getClass: () => class {},
        switchToHttp: () => ({
          getRequest: () => ({ ip, body: { email: identity }, headers: {} }),
          getResponse: () => ({ setHeader: retry }),
        }),
      } as unknown as ExecutionContext);
    expect(attempt('192.0.2.10', email)).toBe(true);
    expect(attempt('192.0.2.10', email)).toBe(true);
    expect(() => attempt('192.0.2.10', freshEmail)).toThrow('Too many attempts');
    // The rejected IP did not allocate/consume the fresh identity's counters.
    expect(attempt('192.0.2.11', freshEmail)).toBe(true);
    expect(attempt('192.0.2.11', freshEmail)).toBe(true);
    expect(() => attempt('192.0.2.12', freshEmail)).toThrow('Too many attempts');
    expect(retry).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });
});

describe('bounded authentication counters', () => {
  it('fails closed for new identities at capacity without evicting active quotas', () => {
    const store = new RateLimitStore(2);
    expect(store.hit('known-ip', 2, 900_000, 0).allowed).toBe(true);
    expect(store.hit('known-identity', 1, 900_000, 0).allowed).toBe(true);
    for (let i = 0; i < 100; i++)
      expect(store.hit(`overflow-${i}`, 2, 900_000, i).allowed).toBe(false);
    // Existing windows still work, but reaching capacity cannot reset them.
    expect(store.hit('known-ip', 2, 900_000, 101).allowed).toBe(true);
    expect(store.hit('known-ip', 2, 900_000, 102).allowed).toBe(false);
    expect(store.hit('known-identity', 1, 900_000, 103).allowed).toBe(false);
  });

  it('recovers expired capacity without removing a still-active cooldown', () => {
    const store = new RateLimitStore(2);
    expect(store.hit('short', 1, 60_000, 0).allowed).toBe(true);
    expect(store.hit('long', 1, 120_000, 0).allowed).toBe(true);
    const denied = store.hit('new', 1, 120_000, 1);
    expect(denied).toEqual({ allowed: false, resetAt: 60_001 });
    expect(store.hit('new', 1, 120_000, 60_001).allowed).toBe(true);
    expect(store.hit('long', 1, 120_000, 60_002).allowed).toBe(false);
    expect(store.hit('another', 1, 120_000, 60_003).allowed).toBe(false);
  });

  it('lets an expired identity start a fresh window while capacity is occupied', () => {
    const store = new RateLimitStore(1);
    expect(store.hit('identity', 1, 1000, 0).allowed).toBe(true);
    expect(store.hit('identity', 1, 1000, 1).allowed).toBe(false);
    expect(store.hit('identity', 1, 1000, 1000)).toEqual({ allowed: true, resetAt: 2000 });
    expect(store.hit('different', 1, 1000, 1001).allowed).toBe(false);
    expect(store.hit('identity', 1, 1000, 1002).allowed).toBe(false);
  });
});
