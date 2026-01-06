export type DetectedEvent = {
  tenant_key?: string;
  tenantKey?: string;
  event_id?: string;
  eventId?: string;
  reading_id?: number | string;
  readingId?: number | string;
  violation_id?: number | string;
  violationId?: number | string;
  sensor_code?: string;
  sensorCode?: string;
  metric?: string;
  value?: number;
  unit?: string;
  observed_at?: number | string;
  observedAt?: number | string;
  detected_at?: number | string;
  detectedAt?: number | string;
  has_violation?: boolean;
  hasViolation?: boolean;
  severity?: string;
  violation_type?: string;
  violationType?: string;
  expected_min?: number;
  expectedMin?: number;
  expected_max?: number;
  expectedMax?: number;
  scenario?: string;
  data_profile?: string;
  dataProfile?: string;
  correlation_id?: string;
  correlationId?: string;
  trace_id?: string;
  traceId?: string;
  tags?: Record<string, unknown>;
};

export type NormalizedDetectedEvent = {
  tenant_key: string;
  event_id?: string;
  reading_id?: string;
  violation_id?: string;
  sensor_code: string;
  metric?: string;
  value?: number;
  unit?: string;
  observed_at?: string;
  detected_at?: string;
  detected_at_ms: number;
  has_violation: boolean;
  severity: string;
  violation_type?: string;
  expected_min?: number;
  expected_max?: number;
  scenario?: string;
  data_profile?: string;
  correlation_id?: string;
  trace_id?: string;
  tags?: Record<string, unknown>;
};

export type NotificationMessage = {
  title: string;
  text: string;
  severity: string;
};

export type NotificationSendResult = {
  channel: string;
  status: "sent" | "skipped" | "failed" | "suppressed";
  reason?: string;
};

export type NotificationChannel = {
  name: string;
  isEnabled(): boolean;
  send(message: NotificationMessage): Promise<NotificationSendResult>;
};

export type NotificationEvent = {
  emitted_at: string;
  tenant_key: string;
  sensor_code: string;
  severity: string;
  violation_type?: string;
  event_id?: string;
  reading_id?: string;
  violation_id?: string;
  detected_at?: string;
  scenario?: string;
  data_profile?: string;
  correlation_id?: string;
  trace_id?: string;
  tags?: Record<string, unknown>;
  throttle_window_seconds: number;
  suppressed_count: number;
  status: "sent" | "suppressed" | "skipped" | "failed";
  channels: string[];
  results: NotificationSendResult[];
};
