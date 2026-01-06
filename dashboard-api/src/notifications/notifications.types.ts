export type NotificationFilters = {
  tenantKey?: string;
  sensorCode?: string;
  severity?: string;
  status?: string;
  channel?: string;
  from?: string;
  to?: string;
  timeWindow?: string;
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
  tags?: Record<string, unknown>;
};

export type NotificationDeliveriesResponse = {
  total: number;
  from?: string;
  to?: string;
  items: NotificationDelivery[];
};
