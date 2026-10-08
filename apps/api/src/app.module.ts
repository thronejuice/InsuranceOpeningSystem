import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ClsPluginTransactional } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { Request } from 'express';
import { ClsModule } from 'nestjs-cls';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { AuditModule } from './common/audit/audit.module.js';
import { AuthCommonModule } from './common/auth/auth-common.module.js';
import { DataScopeModule } from './common/access/data-scope.module.js';
import { envValidationSchema } from './common/config/env.validation.js';
import { HttpExceptionFilter } from './common/http/http-exception.filter.js';
import { ResponseInterceptor } from './common/http/response.interceptor.js';
import { createValidationPipe } from './common/http/validation.pipe.js';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { PrismaService } from './common/prisma/prisma.service.js';
import { SequenceModule } from './common/sequence/sequence.module.js';
import { StorageModule } from './common/storage/storage.module.js';
import { PdfModule } from './common/pdf/pdf.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CustomerModule } from './modules/customer/customer.module.js';
import { DocumentModule } from './modules/document/document.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { JobModule } from './modules/job/job.module.js';
import { MasterModule } from './modules/master/master.module.js';
import { QuotationModule } from './modules/quotation/quotation.module.js';
import { ProposalModule } from './modules/proposal/proposal.module.js';
import { ApprovalModule } from './modules/approval/approval.module.js';
import { PolicyModule } from './modules/policy/policy.module.js';
import { PaymentModule } from './modules/payment/payment.module.js';
import { CommissionModule } from './modules/commission/commission.module.js';
import { TaskModule } from './modules/task/task.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { UserModule } from './modules/user/user.module.js';
import { RenewalModule } from './modules/renewal/renewal.module.js';
import { NotificationModule } from './modules/notification/notification.module.js';
import { ReportModule } from './modules/report/report.module.js';
import { ImportModule } from './modules/import/import.module.js';
import { CompanyProfileModule } from './modules/company-profile/company-profile.module.js';

const rootEnvPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env');

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: rootEnvPath,
      validationSchema: envValidationSchema,
    }),
    // Global API rate limit: 300 req / 60 s per IP — guards against scraping / enumeration.
    // Login has a stricter per-IP+username limit in AuthModule via LoginThrottlerGuard.
    ThrottlerModule.forRoot([{ name: 'global', ttl: 60_000, limit: 300 }]),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),
    PrismaModule,
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        setup: (cls, req: Request) => {
          cls.set('ip', req.ip);
          cls.set('userAgent', req.headers['user-agent']);
        },
      },
      plugins: [
        new ClsPluginTransactional({
          imports: [PrismaModule],
          adapter: new TransactionalAdapterPrisma<PrismaService>({
            prismaInjectionToken: PrismaService,
            sqlFlavor: 'postgresql',
          }),
        }),
      ],
    }),
    SequenceModule,
    AuditModule,
    AuthCommonModule,
    DataScopeModule,
    StorageModule,
    PdfModule,
    AuthModule,
    CustomerModule,
    DocumentModule,
    JobModule,
    MasterModule,
    QuotationModule,
    ProposalModule,
    ApprovalModule,
    PolicyModule,
    PaymentModule,
    CommissionModule,
    TaskModule,
    DashboardModule,
    UserModule,
    RenewalModule,
    NotificationModule,
    ReportModule,
    ImportModule,
    CompanyProfileModule,
    HealthModule,
  ],
  providers: [
    // Registered here (not in main.ts) so e2e tests that boot AppModule get the same behaviour
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    // Global rate limit — individual routes can override with @Throttle({ global: { limit: X, ttl: Y } })
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
