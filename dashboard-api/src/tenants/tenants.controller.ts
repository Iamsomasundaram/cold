import { Controller, Get } from "@nestjs/common";
import { TenantsService } from "./tenants.service";

@Controller("api/tenants")
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  async listTenants() {
    return this.tenantsService.listTenants();
  }
}
