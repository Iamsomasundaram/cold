import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type { IncomingMessage } from "http";
import { RawData, Server, WebSocket } from "ws";
import { DashboardService } from "./dashboard.service";

type DashboardFilters = {
  tenantKey?: string;
  sensorCode?: string;
  metric?: string;
  scenario?: string;
  dataProfile?: string;
  severity?: string;
  violationType?: string;
  from?: string;
  to?: string;
  timeWindow?: string;
};

type WsMessage = {
  type: string;
  filters?: Record<string, unknown>;
};

type ClientContext = {
  filters: DashboardFilters;
};

@WebSocketGateway({ path: "/ws" })
export class DashboardGateway {
  @WebSocketServer() server!: Server;

  private readonly logger = new Logger(DashboardGateway.name);
  private readonly clients = new Map<WebSocket, ClientContext>();
  private readonly apiToken: string;
  private readonly defaultTenantKey: string;
  private readonly intervalId: NodeJS.Timeout;

  constructor(
    private readonly dashboardService: DashboardService,
    private readonly config: ConfigService
  ) {
    this.apiToken = this.config.get("API_TOKEN", "dev-token");
    this.defaultTenantKey = this.config.get("DEFAULT_TENANT_KEY", "");
    const intervalMs = Number(this.config.get("WS_PUSH_INTERVAL_MS", 5000));
    this.intervalId = setInterval(() => {
      void this.pushUpdates();
    }, intervalMs);
  }

  handleConnection(client: WebSocket, req: IncomingMessage) {
    const url = this.safeUrl(req);
    if (!this.isAuthorized(req, url)) {
      client.close(1008, "unauthorized");
      return;
    }

    const filters = this.withDefaults(this.parseFilters(url));
    this.clients.set(client, { filters });

    client.on("message", (data: RawData) => this.handleMessage(client, data));
    client.on("close", () => this.clients.delete(client));

    this.send(client, { type: "connected", filters });
  }

  handleDisconnect(client: WebSocket) {
    this.clients.delete(client);
  }

  private safeUrl(req: IncomingMessage): URL {
    const host = req.headers.host || "localhost";
    const raw = req.url || "/";
    return new URL(raw, `http://${host}`);
  }

  private isAuthorized(req: IncomingMessage, url: URL) {
    if (!this.apiToken) return true;
    const token = this.extractToken(req, url);
    return token === this.apiToken;
  }

  private extractToken(req: IncomingMessage, url: URL) {
    const headerToken =
      (req.headers["x-api-token"] as string | undefined) ||
      (req.headers["authorization"] as string | undefined) ||
      "";
    const bearer = headerToken.startsWith("Bearer ")
      ? headerToken.slice("Bearer ".length)
      : headerToken;
    if (bearer) return bearer;
    return url.searchParams.get("token");
  }

  private parseFilters(url: URL): DashboardFilters {
    const params = url.searchParams;
    return {
      tenantKey: params.get("tenant_key") || undefined,
      sensorCode: params.get("sensor_code") || undefined,
      metric: params.get("metric") || undefined,
      scenario: params.get("scenario") || undefined,
      dataProfile: params.get("data_profile") || undefined,
      severity: params.get("severity") || undefined,
      violationType: params.get("violation_type") || undefined,
      timeWindow: params.get("time_window") || undefined,
      from: params.get("from") || undefined,
      to: params.get("to") || undefined,
    };
  }

  private normalizeFilters(
    filters: Record<string, unknown> | null | undefined
  ): DashboardFilters {
    const raw = filters || {};
    const pick = (value: unknown) =>
      typeof value === "string" && value.trim() ? value : undefined;

    return {
      tenantKey: pick(raw.tenantKey ?? raw.tenant_key),
      sensorCode: pick(raw.sensorCode ?? raw.sensor_code),
      metric: pick(raw.metric),
      scenario: pick(raw.scenario),
      dataProfile: pick(raw.dataProfile ?? raw.data_profile),
      severity: pick(raw.severity),
      violationType: pick(raw.violationType ?? raw.violation_type),
      timeWindow: pick(raw.timeWindow ?? raw.time_window),
      from: pick(raw.from),
      to: pick(raw.to),
    };
  }

  private withDefaults(filters: DashboardFilters): DashboardFilters {
    if (!filters.tenantKey && this.defaultTenantKey) {
      return { ...filters, tenantKey: this.defaultTenantKey };
    }
    return filters;
  }

  private handleMessage(client: WebSocket, data: RawData) {
    const raw = data.toString();
    if (!raw) return;

    let message: WsMessage;
    try {
      message = JSON.parse(raw);
    } catch (err) {
      this.send(client, { type: "error", message: "Invalid message" });
      return;
    }

    if (message.type === "subscribe") {
      const nextFilters = this.withDefaults(
        this.normalizeFilters(message.filters)
      );
      this.clients.set(client, { filters: nextFilters });
      this.send(client, { type: "subscribed", filters: nextFilters });
    }
  }

  private send(client: WebSocket, payload: Record<string, unknown>) {
    if (client.readyState !== WebSocket.OPEN) return;
    client.send(JSON.stringify(payload));
  }

  private async pushUpdates() {
    if (!this.clients.size) return;

    const tasks = Array.from(this.clients.entries()).map(
      async ([client, ctx]) => {
        if (client.readyState !== WebSocket.OPEN) {
          this.clients.delete(client);
          return;
        }

        const filters = this.withDefaults(ctx.filters);
        if (!filters.tenantKey) {
          this.send(client, {
            type: "error",
            message: "tenant_key is required",
          });
          return;
        }

        try {
          // Query per-client filters; keep payload small for frequent pushes.
          const [summary, violations] = await Promise.all([
            this.dashboardService.getSummary(filters),
            this.dashboardService.getViolations(filters, 10, 0),
          ]);
          this.send(client, { type: "update", summary, violations });
        } catch (err) {
          this.logger.warn({ err }, "Dashboard WS push failed");
          this.send(client, {
            type: "error",
            message: "Failed to fetch updates",
          });
        }
      }
    );

    await Promise.all(tasks);
  }
}
