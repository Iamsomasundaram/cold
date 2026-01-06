export type Tenant = {
  tenant_key: string;
  name: string;
  status?: string;
};

export type Sensor = {
  sensor_code: string;
  sensor_type?: string;
  status?: string;
  location?: {
    name?: string;
    site_name?: string;
    zone?: string;
    rack?: string;
  };
};

export type Summary = {
  from: string;
  to: string;
  total: number;
  by_severity: Record<string, number>;
  by_violation_type: Record<string, number>;
  top_sensors: Array<{ key: string; count: number }>;
  top_metrics: Array<{ key: string; count: number }>;
  top_zones: Array<{ key: string; count: number }>;
  updated_at?: string;
};

export type DetectedEvent = {
  event_id?: string;
  reading_id?: string | number;
  violation_id?: string | number;
  sensor_code?: string;
  metric?: string;
  value?: number;
  unit?: string;
  has_violation?: boolean;
  severity?: string;
  violation_type?: string;
  expected_min?: number;
  expected_max?: number;
  observed_at?: number;
  detected_at?: number;
  scenario?: string;
  data_profile?: string;
  correlation_id?: string;
  trace_id?: string;
  tags?: Record<string, unknown> | string[] | null;
  location?: {
    site_name?: string;
    zone?: string;
    rack?: string;
  };
  rule_version?: string;
  [key: string]: unknown;
};

export type ViolationsResponse = {
  from: string;
  to: string;
  total: number;
  items: DetectedEvent[];
};

export type TimeSeriesBucket = {
  ts: number;
  count: number;
  by_severity?: Record<string, number>;
  by_violation_type?: Record<string, number>;
};

export type TimeSeriesResponse = {
  from: string;
  to: string;
  interval: string;
  buckets: TimeSeriesBucket[];
};

export type GenaiRequest = {
  question: string;
  tenant_key: string;
  sensor_code?: string | null;
  metric?: string | null;
  scenario?: string | null;
  data_profile?: string | null;
  time_window?: string | null;
};

export type GenaiResponse = {
  answer: string;
  context: Record<string, unknown>;
};

export type NotificationDelivery = {
  tenant_key: string;
  sensor_code: string;
  severity: string;
  violation_type?: string;
  event_id?: string;
  reading_id?: string;
  violation_id?: string;
  channel: string;
  status: string;
  reason?: string;
  detected_at: string;
  correlation_id?: string;
  trace_id?: string;
  tags?: Record<string, unknown> | string[] | null;
};

export type NotificationDeliveriesResponse = {
  total: number;
  from?: string;
  to?: string;
  items: NotificationDelivery[];
};
