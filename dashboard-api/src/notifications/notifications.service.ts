import { BadGatewayException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { resolveTimeRange } from "../common/time";
import {
  NotificationDeliveriesResponse,
  NotificationFilters,
} from "./notifications.types";

const DEFAULT_TIMEOUT_MS = 10000;

@Injectable()
export class NotificationsService {
  private readonly deliveriesEndpoint: string;
  private readonly rulesEndpoint: string;
  private readonly timeoutMs: number;
  private readonly defaultWindowMinutes: number;

  constructor(private readonly config: ConfigService) {
    const base = String(
      this.config.get("NOTIFICATION_URL", "http://localhost:4003")
    ).replace(/\/$/, "");
    this.deliveriesEndpoint = `${base}/api/deliveries`;
    this.rulesEndpoint = `${base}/api/rules`;
    this.timeoutMs = Number(
      this.config.get("NOTIFICATION_TIMEOUT_MS", DEFAULT_TIMEOUT_MS)
    );
    this.defaultWindowMinutes = Number(
      this.config.get("DEFAULT_TIME_WINDOW_MINUTES", 120)
    );
  }

  async listRules(tenantKey?: string) {
    const params = new URLSearchParams();
    if (tenantKey) params.set("tenant_key", tenantKey);
    const url = params.toString()
      ? `${this.rulesEndpoint}?${params.toString()}`
      : this.rulesEndpoint;

    return this.fetchJson(url);
  }

  async listDeliveries(
    filters: NotificationFilters,
    limit = 50,
    offset = 0
  ): Promise<NotificationDeliveriesResponse> {
    const range = resolveTimeRange({
      from: filters.from,
      to: filters.to,
      timeWindow: filters.timeWindow,
      defaultMinutes: this.defaultWindowMinutes,
    });

    const params = new URLSearchParams();
    if (filters.tenantKey) params.set("tenant_key", filters.tenantKey);
    if (filters.sensorCode) params.set("sensor_code", filters.sensorCode);
    if (filters.severity) params.set("severity", filters.severity);
    if (filters.status) params.set("status", filters.status);
    if (filters.channel) params.set("channel", filters.channel);
    params.set("from", range.fromIso);
    params.set("to", range.toIso);
    params.set("limit", String(limit));
    params.set("offset", String(offset));

    const url = `${this.deliveriesEndpoint}?${params.toString()}`;
    return this.fetchJson<NotificationDeliveriesResponse>(url);
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal });
      const text = await response.text();
      if (!response.ok) {
        throw new BadGatewayException(
          text ? `Notification API error: ${text}` : "Notification API failed"
        );
      }
      return text ? (JSON.parse(text) as T) : ({} as T);
    } catch (err: any) {
      if (err?.name === "AbortError") {
        throw new BadGatewayException("Notification API timed out");
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}
