import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "tenant" })
export class TenantEntity {
  @PrimaryColumn({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "tenant_key", type: "text" })
  tenantKey!: string;

  @Column({ name: "name", type: "text" })
  name!: string;

  @Column({ name: "status", type: "text" })
  status!: string;
}
