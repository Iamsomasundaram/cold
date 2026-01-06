import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SensorEntity } from "./sensor.entity";
import { SensorsController } from "./sensors.controller";
import { SensorsService } from "./sensors.service";

@Module({
  imports: [TypeOrmModule.forFeature([SensorEntity])],
  providers: [SensorsService],
  controllers: [SensorsController],
  exports: [SensorsService],
})
export class SensorsModule {}
