import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DashboardController } from "./dashboard.controller";
import { DashboardGateway } from "./dashboard.gateway";
import { DashboardService } from "./dashboard.service";
import { EsService } from "./es.service";

@Module({
  imports: [ConfigModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardGateway, EsService],
  exports: [DashboardService],
})
export class DashboardModule {}
