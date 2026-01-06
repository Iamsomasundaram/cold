import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";

@Controller("api/rules")
export class NotificationRulesController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@Query("tenant_key") tenantKey?: string) {
    return this.notifications.listRules(tenantKey);
  }

  @Post()
  create(@Body() body: Record<string, any>) {
    return this.notifications.createRule(body);
  }

  @Put(":id")
  update(@Param("id") id: string, @Body() body: Record<string, any>) {
    return this.notifications.updateRule(id, body);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.notifications.deleteRule(id);
  }
}

@Controller("api/deliveries")
export class NotificationDeliveriesController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@Query() query: Record<string, string>) {
    const limit = query.limit ? Number(query.limit) : 50;
    const offset = query.offset ? Number(query.offset) : 0;

    return this.notifications.listDeliveries(
      {
        tenantKey: query.tenant_key,
        sensorCode: query.sensor_code,
        severity: query.severity,
        status: query.status,
        channel: query.channel,
        from: query.from,
        to: query.to,
      },
      limit,
      offset
    );
  }
}
