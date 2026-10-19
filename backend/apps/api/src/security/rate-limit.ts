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
/** Throttles a public authentication action per client IP and per submitted identity. */
export const RateLimit = (bucket: string) => SetMetadata(RATE_LIMIT, bucket);

/**
 * Fixed-window counters held in this process. The pilot runs one API
 * instance; a horizontally scaled deployment must move this to Redis.
 */
const windows = new Map<string, { count: number; resetAt: number }>();

function hit(key: string, limit: number, windowMs: number, now: number) {
  const current = windows.get(key);
  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, resetAt: now + windowMs };
  }
  current.count += 1;
  return { allowed: current.count <= limit, resetAt: current.resetAt };
}

// Bounded memory: drop expired windows periodically.
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of windows) if (value.resetAt <= now) windows.delete(key);
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
    const checks = [hit(`${bucket}:ip:${ip}`, perIp, windowMs, now)];
    const identity = identityOf(req);
    if (identity) checks.push(hit(`${bucket}:id:${identity}:${ip}`, perIdentity, windowMs, now));
    const blocked = checks.find((c) => !c.allowed);
    if (blocked) {
      res.setHeader('Retry-After', String(Math.ceil((blocked.resetAt - now) / 1000)));
      logEvent('warn', 'rate_limited', { bucket, ip, requestId: req.headers['x-request-id'] });
      throw new HttpException(
        { message: 'Too many attempts. Wait a few minutes and try again.', code: 'RATE_LIMITED' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
