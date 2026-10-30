import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { config } from '../platform/config';
import { logEvent } from '../platform/logger';

export const RATE_LIMIT = 'operix:rate-limit';
/** Throttles authentication per client IP and, for login, across IPs per identity. */
export const RateLimit = (bucket: string) => SetMetadata(RATE_LIMIT, bucket);

/**
 * Fixed-window counters held in this process. The pilot runs one API
 * instance; a horizontally scaled deployment must move this to Redis.
 */
export class RateLimitStore {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();
  private nextSweepAt = 0;

  constructor(private readonly maxWindows = 10_000) {}

  pruneExpired(now: number) {
    for (const [key, value] of this.windows) if (value.resetAt <= now) this.windows.delete(key);
    this.nextSweepAt = now + 60_000;
  }

  hit(key: string, limit: number, windowMs: number, now: number) {
    const current = this.windows.get(key);
    if (current && current.resetAt > now) {
      current.count = Math.min(current.count + 1, limit + 1);
      return { allowed: current.count <= limit, resetAt: current.resetAt };
    }
    if (current) this.windows.delete(key);
    if (this.windows.size >= this.maxWindows) {
      // At capacity, sweep at most once per minute to avoid a full-map scan for
      // every rejected identity. Never evict active counters: that resets quotas.
      if (now >= this.nextSweepAt) this.pruneExpired(now);
      if (this.windows.size >= this.maxWindows)
        return { allowed: false, resetAt: this.nextSweepAt };
    }
    this.windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, resetAt: now + windowMs };
  }
}

const windows = new RateLimitStore();
// The hard capacity bounds memory; expiry cleanup recovers space without
// deleting active limits. New identities fail closed while the store is full.
setInterval(() => {
  windows.pruneExpired(Date.now());
}, 60_000).unref();

const identityOf = (req: Request) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const raw = [body.email, body.token, body.refreshToken].find((v) => typeof v === 'string') as
    string | undefined;
  // Hash so that tokens never sit in memory keys verbatim.
  return raw
    ? createHash('sha256').update(raw.trim().toLowerCase()).digest('hex').slice(0, 32)
    : null;
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const bucket = this.reflector.getAllAndOverride<string>(RATE_LIMIT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!bucket) return true;
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const { windowMs, perIdentity, perIp } = config().rateLimit;
    const now = Date.now();
    const ip = req.ip ?? 'unknown';
    const reject = (resetAt: number): never => {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((resetAt - now) / 1000))));
      logEvent('warn', 'rate_limited', { bucket, ip, requestId: req.headers['x-request-id'] });
      throw new HttpException(
        { message: 'Too many attempts. Wait a few minutes and try again.', code: 'RATE_LIMITED' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    };
    const ipCheck = windows.hit(`${bucket}:ip:${ip}`, perIp, windowMs, now);
    // A blocked IP must not keep allocating attacker-chosen identity counters.
    if (!ipCheck.allowed) reject(ipCheck.resetAt);
    const identity = identityOf(req);
    // Rotating client IPs must not reset the login/MFA guessing budget. This is
    // a temporary identity cooldown, not a permanent account-status change.
    if (identity) {
      const identityCheck = windows.hit(
        `${bucket}:id:${identity}${bucket === 'login' ? '' : `:${ip}`}`,
        perIdentity,
        windowMs,
        now,
      );
      if (!identityCheck.allowed) reject(identityCheck.resetAt);
    }
    return true;
  }
}
