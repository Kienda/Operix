import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../security/public.decorator';
import { DatabaseService } from './database.module';

@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  /** Liveness: the process is serving HTTP. Never touches dependencies. */
  @Public() @Get('live') live() {
    return { status: 'ok', service: 'operix-api', version: process.env.OPERIX_VERSION ?? 'dev' };
  }

  /** Readiness: 503 when the database is unreachable, so deploys and monitors fail loudly. */
  @Public() @Get() async health() {
    const body = {
      service: 'operix-api',
      version: process.env.OPERIX_VERSION ?? 'dev',
      timestamp: new Date().toISOString(),
    };
    try {
      await this.db.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({
        ...body,
        status: 'degraded',
        database: 'unavailable',
      });
    }
    return { ...body, status: 'ok', database: 'connected' };
  }
}
