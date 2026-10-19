import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { tap } from 'rxjs/operators';
import type { Observable } from 'rxjs';
import { DatabaseService } from '../platform/database.module';
import type { AuthenticatedRequest } from './request-context';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly db: DatabaseService) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return next.handle().pipe(
      tap(() => {
        if (req.auth && !['GET', 'HEAD'].includes(req.method))
          void this.db.auditLog
            .create({
              data: {
                organizationId: req.auth.organizationId,
                userId: req.auth.userId,
                action: req.method,
                resource: req.path,
                metadata: { requestId: req.headers['x-request-id'] ?? null },
              },
            })
            .catch(() => undefined);
      }),
    );
  }
}
