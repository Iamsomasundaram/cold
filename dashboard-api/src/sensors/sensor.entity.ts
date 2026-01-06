import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "sensor" })
export class SensorEntity {
  @PrimaryGeneratedColumn({ name: "id", type: "bigint" })
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "sensor_code", type: "text" })
  sensorCode!: string;

  @Column({ name: "sensor_type", type: "text" })
  sensorType!: string;

  @Column({ name: "location_id", type: "bigint", nullable: true })
  locationId?: string | null;

  @Column({ name: "status", type: "text" })
  status!: string;
}
