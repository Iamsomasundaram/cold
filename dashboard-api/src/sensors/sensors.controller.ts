import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { SensorsService } from "./sensors.service";

@Controller("api/sensors")
export class SensorsController {
  constructor(private readonly sensorsService: SensorsService) {}

  @Get()
  async listSensors(@Query("tenant_key") tenantKey?: string) {
    if (!tenantKey) {
      throw new BadRequestException("tenant_key is required");
    }
    return this.sensorsService.listSensors(tenantKey);
  }
}
