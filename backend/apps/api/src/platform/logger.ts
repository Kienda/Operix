import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { AuthenticatedRequest } from '../security/request-context';

type Level = 'info' | 'warn' | 'error';

/** One JSON object per line, suitable for docker/CloudWatch ingestion. Never pass secrets. */
export function logEvent(level: Level, event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...fields });
  if (level === 'error') console.error(line);
  else console.log(line);
}

const REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

/** Assigns a correlation ID (trusting a well-formed upstream one) and logs each response. */
export function requestContext(logRequests: boolean) {
  return (req: Request, res: Response, next: NextFunction) => {
    const incoming = req.headers['x-request-id'];
    const requestId =
      typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    req.headers['x-request-id'] = requestId;
    res.setHeader('x-request-id', requestId);
    const started = process.hrtime.bigint();
    if (logRequests)
      res.on('finish', () => {
        const auth = (req as AuthenticatedRequest).auth;
        logEvent(res.statusCode >= 500 ? 'error' : 'info', 'http_request', {
          requestId,
          method: req.method,
          // Path only: query strings can carry tokens or personal data.
          path: req.path,
          status: res.statusCode,
          durationMs: Number((process.hrtime.bigint() - started) / 1_000_000n),
          userId: auth?.userId,
          organizationId: auth?.organizationId,
          ip: req.ip,
        });
      });
    next();
  };
}
