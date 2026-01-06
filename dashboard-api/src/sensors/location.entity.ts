import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "location" })
export class LocationEntity {
  @PrimaryGeneratedColumn({ name: "id", type: "bigint" })
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "location_type", type: "text" })
  locationType!: string;

  @Column({ name: "name", type: "text" })
  name!: string;

  @Column({ name: "parent_location_id", type: "bigint", nullable: true })
  parentLocationId?: string | null;

  @Column({ name: "site_name", type: "text", nullable: true })
  siteName?: string | null;

  @Column({ name: "zone", type: "text", nullable: true })
  zone?: string | null;

  @Column({ name: "rack", type: "text", nullable: true })
  rack?: string | null;
}
