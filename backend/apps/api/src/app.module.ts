import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { DatabaseModule } from './platform/database.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './platform/health.controller';
import { AccessGuard } from './security/access.guard';
import { RateLimitGuard } from './security/rate-limit';
import { AuditInterceptor } from './security/audit.interceptor';
import { ResourcesModule } from './resources/resources.module';
import { FinanceModule } from './workflows/finance.module';
import { InventoryModule } from './workflows/inventory.module';
import { AttendanceModule } from './workflows/attendance.module';
import { ProjectsModule } from './workflows/projects.module';
import { QuotationsController } from './workflows/quotations.controller';
import { AdminController } from './platform/admin.controller';
import { SubscriptionsController } from './platform/subscriptions.controller';
import { WorkspaceController } from './platform/workspace.controller';
import { MailModule } from './platform/mail.service';
import { config } from './platform/config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    // Secret comes from validated configuration; there is no hardcoded fallback.
    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({ secret: config().jwtSecret, signOptions: { expiresIn: '15m' } }),
    }),
    DatabaseModule,
    MailModule,
    AuthModule,
    ResourcesModule,
    FinanceModule,
    InventoryModule,
    AttendanceModule,
    ProjectsModule,
  ],
  controllers: [
    HealthController,
    AdminController,
    SubscriptionsController,
    WorkspaceController,
    QuotationsController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: AccessGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
