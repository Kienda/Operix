import 'reflect-metadata';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './platform/api-exception.filter';
import { config } from './platform/config';
import { logEvent, requestContext } from './platform/logger';

// Local UI dev servers that should always be able to call the API in
// non-production environments, regardless of what CORS_ORIGINS resolves to.
const DEV_ORIGINS = ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:8081'];

async function bootstrap() {
  // Fails fast, before listening, on missing or placeholder production settings.
  const settings = config();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.set('trust proxy', settings.trustProxy);
  app.disable('x-powered-by');
  app.use(requestContext(settings.requestLogging));
  app.use(helmet());
  app.enableCors({
    origin: settings.production
      ? settings.corsOrigins
      : [...new Set([...settings.corsOrigins, ...DEV_ORIGINS])],
    credentials: false,
    exposedHeaders: ['x-request-id', 'retry-after'],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.setGlobalPrefix('api');
  app.useBodyParser('json', { limit: '256kb' });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
  if (settings.swaggerEnabled) {
    const document = new DocumentBuilder()
      .setTitle('Operix API')
      .setDescription('Secure multi-tenant business operations API')
      .setVersion(process.env.OPERIX_VERSION ?? 'dev')
      .addBearerAuth()
      .addApiKey({ type: 'apiKey', in: 'header', name: 'x-organization-id' }, 'organization')
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, document));
  }
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  logEvent('info', 'api_started', {
    port,
    version: process.env.OPERIX_VERSION ?? 'dev',
    environment: process.env.NODE_ENV ?? 'development',
    modules: settings.moduleAllowlist.length ? settings.moduleAllowlist : 'database-defined',
  });
}
bootstrap().catch((error: Error) => {
  logEvent('error', 'api_start_failed', { reason: error.message });
  process.exit(1);
});
