import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { PermissionsGuard } from './auth/permissions.guard';
import { IdempotencyMiddleware } from './common/idempotency.middleware';
import { DashboardModule } from './dashboard/dashboard.module';
import { DistributionModule } from './distribution/distribution.module';
import { HousekeepingModule } from './housekeeping/housekeeping.module';
import { InventoryModule } from './inventory/inventory.module';
import { NightAuditModule } from './night-audit/night-audit.module';
import { PrismaModule } from './prisma/prisma.module';
import { PropertiesModule } from './properties/properties.module';
import { ReservationsModule } from './reservations/reservations.module';
import { RoomsModule } from './rooms/rooms.module';
import { StaysModule } from './stays/stays.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditModule,
    AuthModule,
    PropertiesModule,
    RoomsModule,
    InventoryModule,
    ReservationsModule,
    StaysModule,
    HousekeepingModule,
    DashboardModule,
    NightAuditModule,
    DistributionModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(IdempotencyMiddleware).forRoutes('*');
  }
}
