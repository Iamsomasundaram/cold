import { Controller, Get, Query } from "@nestjs/common";
import { DashboardService } from "./dashboard.service";

@Controller("api")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("summary")
  getSummary(@Query() query: Record<string, string>) {
    return this.dashboardService.getSummary({
      tenantKey: query.tenant_key,
      sensorCode: query.sensor_code,
      metric: query.metric,
      scenario: query.scenario,
      dataProfile: query.data_profile,
      from: query.from,
      to: query.to,
      timeWindow: query.time_window,
    });
  }

  @Get("violations")
  getViolations(@Query() query: Record<string, string>) {
    const limit = query.limit ? Number(query.limit) : 50;
    const offset = query.offset ? Number(query.offset) : 0;

    return this.dashboardService.getViolations(
      {
        tenantKey: query.tenant_key,
        sensorCode: query.sensor_code,
        metric: query.metric,
        scenario: query.scenario,
        dataProfile: query.data_profile,
        severity: query.severity,
        violationType: query.violation_type,
        from: query.from,
        to: query.to,
        timeWindow: query.time_window,
      },
      limit,
      offset
    );
  }

  @Get("timeseries")
  getTimeSeries(@Query() query: Record<string, string>) {
    return this.dashboardService.getTimeSeries(
      {
        tenantKey: query.tenant_key,
        sensorCode: query.sensor_code,
        metric: query.metric,
        scenario: query.scenario,
        dataProfile: query.data_profile,
        from: query.from,
        to: query.to,
        timeWindow: query.time_window,
      },
      query.interval
    );
  }
}
