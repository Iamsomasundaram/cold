import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { TenantEntity } from "../tenants/tenant.entity";
import { LocationEntity } from "./location.entity";
import { SensorEntity } from "./sensor.entity";

@Injectable()
export class SensorsService {
  constructor(
    @InjectRepository(SensorEntity)
    private readonly sensorRepo: Repository<SensorEntity>
  ) {}

  async listSensors(tenantKey: string) {
    const rows = await this.sensorRepo
      .createQueryBuilder("sensor")
      .innerJoin(TenantEntity, "tenant", "tenant.tenant_id = sensor.tenant_id")
      .leftJoin(
        LocationEntity,
        "location",
        "location.tenant_id = sensor.tenant_id AND location.id = sensor.location_id"
      )
      .where("tenant.tenant_key = :tenantKey", { tenantKey })
      .select([
        "sensor.sensor_code AS sensor_code",
        "sensor.sensor_type AS sensor_type",
        "sensor.status AS status",
        "location.name AS location_name",
        "location.site_name AS site_name",
        "location.zone AS zone",
        "location.rack AS rack",
      ])
      .orderBy("sensor.sensor_code", "ASC")
      .getRawMany();

    return rows.map((row) => ({
      sensor_code: row.sensor_code,
      sensor_type: row.sensor_type,
      status: row.status,
      location: {
        name: row.location_name,
        site_name: row.site_name,
        zone: row.zone,
        rack: row.rack,
      },
    }));
  }
}
