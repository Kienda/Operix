import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '@operix/database';
import { logEvent } from './logger';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const dbStatus =
      error instanceof Prisma.PrismaClientKnownRequestError
        ? ({ P2002: 409, P2003: 400, P2004: 400, P2025: 404 } as Record<string, number>)[error.code]
        : undefined;
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : (dbStatus ?? HttpStatus.INTERNAL_SERVER_ERROR);
    const value = error instanceof HttpException ? error.getResponse() : null;
    const message =
      typeof value === 'object' && value && 'message' in value
        ? (value as { message: unknown }).message
        : typeof value === 'string'
          ? value
          : dbStatus
            ? 'Operation conflicts with record integrity constraints'
            : 'Unexpected server error';
    // Carry through any extra fields the thrower attached (e.g. a `code` a client
    // branches on, or the workspace list login returns) without echoing Nest's
    // own envelope keys back out.
    const {
      statusCode: _status,
      message: _message,
      error: _error,
      ...extra
    } = typeof value === 'object' && value ? (value as Record<string, unknown>) : {};
    if (status >= 500 && !(error instanceof HttpException && status === 503))
      logEvent('error', 'unhandled_exception', {
        requestId: response.req.headers['x-request-id'] ?? null,
        method: response.req.method,
        path: response.req.path,
        name: error instanceof Error ? error.name : typeof error,
        // Prisma messages can embed query details; keep only the code for known DB errors.
        reason:
          error instanceof Prisma.PrismaClientKnownRequestError
            ? `prisma:${error.code}`
            : error instanceof Error
              ? error.message.slice(0, 500)
              : 'unknown',
        stack: error instanceof Error ? error.stack?.split('\n').slice(0, 8).join('\n') : undefined,
      });
    response
      .status(status)
      .json({
        success: false,
        error: { code: status === 500 ? 'INTERNAL_ERROR' : `HTTP_${status}`, ...extra, message },
        requestId: response.req.headers['x-request-id'] ?? null,
        timestamp: new Date().toISOString(),
      });
  }
}
