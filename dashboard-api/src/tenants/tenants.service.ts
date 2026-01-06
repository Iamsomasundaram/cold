import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { TenantEntity } from "./tenant.entity";

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(TenantEntity)
    private readonly tenantRepo: Repository<TenantEntity>
  ) {}

  async listTenants() {
    const tenants = await this.tenantRepo.find({
      order: { tenantKey: "ASC" },
    });

    return tenants.map((tenant) => ({
      tenant_key: tenant.tenantKey,
      name: tenant.name,
      status: tenant.status,
    }));
  }
}
