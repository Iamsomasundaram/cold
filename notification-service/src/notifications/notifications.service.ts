import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  NotificationDelivery,
  NotificationRule,
  NotificationThrottle,
} from "./notification.schemas";
import {
  DetectedEvent,
  NormalizedDetectedEvent,
  NotificationEvent,
  NotificationChannel,
  NotificationMessage,
  NotificationSendResult,
} from "./notification.types";
import {
  SlackNotifier,
  SendGridNotifier,
  TwilioSmsNotifier,
  TwilioWhatsappNotifier,
} from "./notifiers";
import { NotificationsProducer } from "./notifications.producer";

const DEFAULT_CHANNELS = ["slack", "email", "sms", "whatsapp"];
const SEVERITY_ORDER: Record<string, number> = {
  INFO: 0,
  WARN: 1,
  CRITICAL: 2,
};
const MAX_DELIVERY_LIMIT = 500;

type DeliveryFilters = {
  tenantKey?: string;
  sensorCode?: string;
  severity?: string;
  status?: string;
  channel?: string;
  from?: string;
  to?: string;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly defaultWindowSeconds: number;
  private readonly channelMap: Record<string, NotificationChannel>;

  constructor(
    @InjectModel(NotificationRule.name)
    private readonly ruleModel: Model<NotificationRule>,
    @InjectModel(NotificationThrottle.name)
    private readonly throttleModel: Model<NotificationThrottle>,
    @InjectModel(NotificationDelivery.name)
    private readonly deliveryModel: Model<NotificationDelivery>,
    private readonly config: ConfigService,
    private readonly producer: NotificationsProducer,
    private readonly slack: SlackNotifier,
    private readonly sendGrid: SendGridNotifier,
    private readonly sms: TwilioSmsNotifier,
    private readonly whatsapp: TwilioWhatsappNotifier
  ) {
    this.defaultWindowSeconds = Number(
      this.config.get("NOTIFICATION_DEFAULT_WINDOW_SECONDS", 300)
    );
    this.channelMap = {
      slack: this.slack,
      email: this.sendGrid,
      sms: this.sms,
      whatsapp: this.whatsapp,
    };
  }

  async listRules(tenantKey?: string) {
    const query = tenantKey ? { tenant_key: tenantKey } : {};
    return this.ruleModel.find(query).lean();
  }

  async listDeliveries(
    filters: DeliveryFilters,
    limit = 50,
    offset = 0
  ) {
    const query: Record<string, any> = {};
    if (filters.tenantKey) query.tenant_key = filters.tenantKey;
    if (filters.sensorCode) query.sensor_code = filters.sensorCode;
    if (filters.severity) query.severity = filters.severity;
    if (filters.status) query.status = filters.status;
    if (filters.channel) query.channel = filters.channel;

    const range = this.buildDetectedAtRange(filters.from, filters.to);
    if (range) query.detected_at = range;

    const size = Math.min(Math.max(1, limit), MAX_DELIVERY_LIMIT);
    const skip = Math.max(0, offset);

    const [total, items] = await Promise.all([
      this.deliveryModel.countDocuments(query),
      this.deliveryModel
        .find(query)
        .sort({ detected_at: -1 })
        .skip(skip)
        .limit(size)
        .lean(),
    ]);

    return {
      total,
      from: range?.$gte ? range.$gte.toISOString() : undefined,
      to: range?.$lte ? range.$lte.toISOString() : undefined,
      items,
    };
  }

  async createRule(payload: Record<string, any>) {
    const rule = this.normalizeRulePayload(payload);
    return this.ruleModel.create(rule);
  }

  async updateRule(id: string, payload: Record<string, any>) {
    const updates = this.normalizeRulePayload(payload, true);
    return this.ruleModel.findByIdAndUpdate(id, updates, { new: true }).lean();
  }

  async deleteRule(id: string) {
    return this.ruleModel.findByIdAndDelete(id).lean();
  }

  async handleDetectedEvent(raw: DetectedEvent) {
    const event = this.normalizeDetectedEvent(raw);
    if (!event) return;

    if (!event.has_violation) return;

    if (this.severityRank(event.severity) < SEVERITY_ORDER.WARN) {
      return;
    }

    const rule = await this.resolveRule(event);
    if (!rule || !rule.enabled) {
      return;
    }

    const windowSeconds =
      rule.throttle_window_seconds || this.defaultWindowSeconds;
    const channels = rule.channels?.length ? rule.channels : DEFAULT_CHANNELS;
    const throttleKey = this.buildThrottleKey(
      event.tenant_key,
      event.sensor_code,
      event.severity
    );

    const now = new Date();
    const windowMs = windowSeconds * 1000;
    const throttle = await this.throttleModel.findOne({ key: throttleKey });

    if (
      throttle &&
      now.getTime() - throttle.last_sent_at.getTime() < windowMs
    ) {
      const suppressedTotal = (throttle.suppressed_count || 0) + 1;
      await this.throttleModel.updateOne(
        { key: throttleKey },
        {
          $set: {
            last_event_at: now,
            window_seconds: windowSeconds,
            expires_at: new Date(now.getTime() + windowMs),
          },
          $inc: { suppressed_count: 1 },
        }
      );

      const suppressedResult = {
        channel: "aggregate",
        status: "suppressed",
        reason: "throttled",
      } as NotificationSendResult;

      await this.recordDeliveries(event, channels, [suppressedResult]);
      await this.emitNotificationEvent(
        event,
        channels,
        [suppressedResult],
        "suppressed",
        windowSeconds,
        suppressedTotal
      );
      return;
    }

    const suppressedCount = throttle?.suppressed_count ?? 0;
    const message = this.buildMessage(event, suppressedCount);

    const results = await this.dispatchToChannels(channels, message);
    const enabledResults = results.filter((r) => r.status !== "skipped");
    if (!enabledResults.length) {
      this.logger.warn(
        "No notification channels enabled; alerts will not be sent."
      );
    }

    await this.throttleModel.updateOne(
      { key: throttleKey },
      {
        $set: {
          tenant_key: event.tenant_key,
          sensor_code: event.sensor_code,
          severity: event.severity,
          window_seconds: windowSeconds,
          first_event_at: now,
          last_event_at: now,
          last_sent_at: now,
          suppressed_count: 0,
          expires_at: new Date(now.getTime() + windowMs),
        },
      },
      { upsert: true }
    );

    await this.recordDeliveries(event, channels, results);
    await this.emitNotificationEvent(
      event,
      channels,
      results,
      this.resolveStatus(results),
      windowSeconds,
      suppressedCount
    );
  }

  private normalizeRulePayload(payload: Record<string, any>, partial = false) {
    const rule: Record<string, any> = {};
    if (!partial && !payload.tenant_key) {
      throw new Error("tenant_key is required");
    }

    if (payload.tenant_key !== undefined) {
      rule.tenant_key = String(payload.tenant_key).trim();
    }
    if (payload.sensor_code !== undefined) {
      rule.sensor_code = payload.sensor_code
        ? String(payload.sensor_code).trim()
        : null;
    }
    if (payload.severity !== undefined) {
      rule.severity = payload.severity
        ? String(payload.severity).trim().toUpperCase()
        : null;
    }
    if (payload.channels !== undefined) {
      rule.channels = Array.isArray(payload.channels)
        ? payload.channels.map((c: string) => String(c).trim())
        : DEFAULT_CHANNELS;
    }
    if (payload.throttle_window_seconds !== undefined) {
      rule.throttle_window_seconds = Number(payload.throttle_window_seconds);
    }
    if (payload.enabled !== undefined) {
      rule.enabled = Boolean(payload.enabled);
    }

    return rule;
  }

  private normalizeDetectedEvent(input: DetectedEvent): NormalizedDetectedEvent | null {
    const tenant_key = input.tenant_key || input.tenantKey || "";
    const sensor_code = input.sensor_code || input.sensorCode || "";
    if (!tenant_key || !sensor_code) {
      this.logger.warn("Detected event missing tenant_key or sensor_code.");
      return null;
    }

    const severityRaw = input.severity || "INFO";
    const severity = String(severityRaw).toUpperCase();

    const has_violation =
      Boolean(input.has_violation) || Boolean(input.hasViolation);

    const detected_at =
      input.detected_at || input.detectedAt || new Date().toISOString();
    const detected_at_ms = this.toEpochMs(detected_at);

    return {
      tenant_key,
      event_id: input.event_id || input.eventId,
      reading_id: input.reading_id
        ? String(input.reading_id)
        : input.readingId
        ? String(input.readingId)
        : undefined,
      violation_id: input.violation_id
        ? String(input.violation_id)
        : input.violationId
        ? String(input.violationId)
        : undefined,
      sensor_code,
      metric: input.metric,
      value: input.value,
      unit: input.unit,
      observed_at: this.toIso(input.observed_at || input.observedAt),
      detected_at: this.toIso(detected_at),
      detected_at_ms,
      has_violation,
      severity,
      violation_type: input.violation_type || input.violationType,
      expected_min: input.expected_min || input.expectedMin,
      expected_max: input.expected_max || input.expectedMax,
      scenario: input.scenario,
      data_profile: input.data_profile || input.dataProfile,
      correlation_id: input.correlation_id || input.correlationId,
      trace_id: input.trace_id || input.traceId,
      tags: input.tags || undefined,
    };
  }

  private severityRank(severity: string) {
    return SEVERITY_ORDER[severity] ?? SEVERITY_ORDER.INFO;
  }

  private buildThrottleKey(
    tenantKey: string,
    sensorCode: string,
    severity: string
  ) {
    return `${tenantKey}::${sensorCode}::${severity}`;
  }

  private async resolveRule(event: NormalizedDetectedEvent) {
    const candidates = [
      { tenant_key: event.tenant_key, sensor_code: event.sensor_code, severity: event.severity },
      { tenant_key: event.tenant_key, sensor_code: event.sensor_code, severity: null },
      { tenant_key: event.tenant_key, sensor_code: null, severity: event.severity },
      { tenant_key: event.tenant_key, sensor_code: null, severity: null },
      { tenant_key: "*", sensor_code: event.sensor_code, severity: event.severity },
      { tenant_key: "*", sensor_code: null, severity: event.severity },
      { tenant_key: "*", sensor_code: null, severity: null },
    ];

    for (const candidate of candidates) {
      const rule = await this.ruleModel
        .findOne({
          tenant_key: candidate.tenant_key,
          sensor_code: candidate.sensor_code ?? null,
          severity: candidate.severity ?? null,
          enabled: true,
        })
        .lean();
      if (rule) return rule;
    }

    return {
      tenant_key: event.tenant_key,
      sensor_code: null,
      severity: null,
      channels: DEFAULT_CHANNELS,
      throttle_window_seconds: this.defaultWindowSeconds,
      enabled: true,
    };
  }

  private buildMessage(
    event: NormalizedDetectedEvent,
    suppressedCount: number
  ): NotificationMessage {
    const expected =
      event.expected_min !== undefined || event.expected_max !== undefined
        ? `${event.expected_min ?? "?"} - ${event.expected_max ?? "?"}`
        : "n/a";
    const detectedAt = event.detected_at || new Date().toISOString();

    const lines = [
      `Tenant: ${event.tenant_key}`,
      `Sensor: ${event.sensor_code}`,
      event.metric ? `Metric: ${event.metric}` : null,
      event.value !== undefined && event.unit
        ? `Value: ${event.value} ${event.unit}`
        : event.value !== undefined
        ? `Value: ${event.value}`
        : null,
      `Expected: ${expected}`,
      `Severity: ${event.severity}`,
      event.violation_type ? `Violation: ${event.violation_type}` : null,
      `Detected at: ${detectedAt}`,
      event.scenario ? `Scenario: ${event.scenario}` : null,
      event.data_profile ? `Data profile: ${event.data_profile}` : null,
      event.correlation_id ? `Correlation: ${event.correlation_id}` : null,
      event.trace_id ? `Trace: ${event.trace_id}` : null,
      suppressedCount > 0
        ? `Suppressed in last window: ${suppressedCount}`
        : null,
    ].filter(Boolean) as string[];

    return {
      title: `[${event.severity}] ${event.tenant_key} ${event.sensor_code} breach`,
      text: lines.join("\n"),
      severity: event.severity,
    };
  }

  private async dispatchToChannels(
    channels: string[],
    message: NotificationMessage
  ): Promise<NotificationSendResult[]> {
    const results: NotificationSendResult[] = [];
    for (const channel of channels) {
      const notifier = this.channelMap[channel];
      if (!notifier) {
        results.push({
          channel,
          status: "skipped",
          reason: "unknown_channel",
        });
        continue;
      }
      try {
        const result = await notifier.send(message);
        results.push(result);
      } catch (err: any) {
        this.logger.error(
          { err, channel },
          "Notification send failed unexpectedly."
        );
        results.push({
          channel,
          status: "failed",
          reason: "exception",
        });
      }
    }
    return results;
  }

  private async recordDeliveries(
    event: NormalizedDetectedEvent,
    channels: string[],
    results: NotificationSendResult[]
  ) {
    const detectedAt = new Date(event.detected_at_ms);

    const records = results.map((result) => ({
      tenant_key: event.tenant_key,
      sensor_code: event.sensor_code,
      severity: event.severity,
      violation_type: event.violation_type,
      event_id: event.event_id,
      reading_id: event.reading_id,
      violation_id: event.violation_id,
      channel: result.channel,
      status: result.status,
      reason: result.reason,
      detected_at: detectedAt,
      correlation_id: event.correlation_id,
      trace_id: event.trace_id,
      tags: event.tags,
    }));

    if (!records.length && channels.length) {
      for (const channel of channels) {
        records.push({
          tenant_key: event.tenant_key,
          sensor_code: event.sensor_code,
          severity: event.severity,
          violation_type: event.violation_type,
          event_id: event.event_id,
          reading_id: event.reading_id,
          violation_id: event.violation_id,
          channel,
          status: "skipped",
          reason: "no_channels",
          detected_at: detectedAt,
          correlation_id: event.correlation_id,
          trace_id: event.trace_id,
          tags: event.tags,
        });
      }
    }

    if (records.length) {
      await this.deliveryModel.insertMany(records);
    }
  }

  private resolveStatus(results: NotificationSendResult[]) {
    if (!results.length) return "skipped";
    if (results.some((r) => r.status === "sent")) return "sent";
    if (results.some((r) => r.status === "failed")) return "failed";
    return "skipped";
  }

  private async emitNotificationEvent(
    event: NormalizedDetectedEvent,
    channels: string[],
    results: NotificationSendResult[],
    status: "sent" | "suppressed" | "skipped" | "failed",
    windowSeconds: number,
    suppressedCount: number
  ) {
    const payload: NotificationEvent = {
      emitted_at: new Date().toISOString(),
      tenant_key: event.tenant_key,
      sensor_code: event.sensor_code,
      severity: event.severity,
      violation_type: event.violation_type,
      event_id: event.event_id,
      reading_id: event.reading_id,
      violation_id: event.violation_id,
      detected_at: event.detected_at,
      scenario: event.scenario,
      data_profile: event.data_profile,
      correlation_id: event.correlation_id,
      trace_id: event.trace_id,
      tags: event.tags,
      throttle_window_seconds: windowSeconds,
      suppressed_count: suppressedCount,
      status,
      channels,
      results,
    };

    const key = `${event.tenant_key}:${event.sensor_code}:${event.severity}`;
    await this.producer.emit(payload, key);
  }

  private toEpochMs(value: number | string | undefined) {
    if (value === undefined || value === null) {
      return Date.now();
    }
    if (typeof value === "number") {
      return value > 1_000_000_000_000 ? value : value * 1000;
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? Date.now() : parsed;
  }

  private toIso(value: number | string | undefined) {
    if (value === undefined || value === null) return undefined;
    if (typeof value === "number") {
      const ms = value > 1_000_000_000_000 ? value : value * 1000;
      return new Date(ms).toISOString();
    }
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
    return String(value);
  }

  private buildDetectedAtRange(from?: string, to?: string) {
    const range: { $gte?: Date; $lte?: Date } = {};
    if (from) {
      const parsed = Date.parse(from);
      if (!Number.isNaN(parsed)) range.$gte = new Date(parsed);
    }
    if (to) {
      const parsed = Date.parse(to);
      if (!Number.isNaN(parsed)) range.$lte = new Date(parsed);
    }
    return Object.keys(range).length ? range : null;
  }
}
