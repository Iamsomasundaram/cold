import { MiddlewareConsumer, Module, NestModule, RequestMethod } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { TypeOrmModule } from "@nestjs/typeorm";

import { ApiTokenMiddleware } from "./common/api-token.middleware";
import { HealthController } from "./health.controller";
import { TenantEntity } from "./tenants/tenant.entity";
import { LocationEntity } from "./sensors/location.entity";
import { SensorEntity } from "./sensors/sensor.entity";
import { TenantsModule } from "./tenants/tenants.module";
import { SensorsModule } from "./sensors/sensors.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { GenaiModule } from "./genai/genai.module";
import { NotificationsModule } from "./notifications/notifications.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres",
        host: config.get("PG_HOST", "localhost"),
        port: Number(config.get("PG_PORT", 5432)),
        database: config.get("PG_DB", "coldstore"),
        username: config.get("PG_USER", "coldstore"),
        password: config.get("PG_PASSWORD", "coldstore"),
        entities: [TenantEntity, LocationEntity, SensorEntity],
        synchronize: false,
        logging: config.get("NODE_ENV") === "development" ? ["error"] : false,
      }),
    }),
    TenantsModule,
    SensorsModule,
    DashboardModule,
    GenaiModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(ApiTokenMiddleware)
      .exclude({ path: "health", method: RequestMethod.GET })
      .forRoutes("*");
  }
}
