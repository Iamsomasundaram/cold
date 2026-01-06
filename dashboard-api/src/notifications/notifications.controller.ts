import { Controller, Get, Query } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";

@Controller("api/notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get("deliveries")
  getDeliveries(@Query() query: Record<string, string>) {
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
        timeWindow: query.time_window,
      },
      limit,
      offset
    );
  }

  @Get("rules")
  getRules(@Query("tenant_key") tenantKey?: string) {
    return this.notifications.listRules(tenantKey);
  }
}
