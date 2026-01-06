// src/observability/metrics.ts
//
// Prometheus metrics registry and helper functions.
// - Exposes counters/gauges/histograms.
// - You will hook these helpers from services / queue / middleware.

// App -> Prometheus (storage/query engine) -> Grafana (visualization)—is the standard architecture

import client from "prom-client";
import { EventPayload } from "../types/EventPayload";

// Use a dedicated registry instead of the global one
export const metricsRegistry = new client.Registry();

// Collect default Node.js process metrics (CPU, memory, etc.)
client.collectDefaultMetrics({
  register: metricsRegistry,
  prefix: "ingest_",
});

// ---------- METRICS DEFINITIONS ----------

// Events received / accepted / rejected
export const eventsReceivedTotal = new client.Counter({
  name: "ingest_events_received_total",
  help: "Total number of events received by ingest API",
  labelNames: ["tenant_key", "metric", "data_profile", "scenario"] as const,
});

export const eventsAcceptedTotal = new client.Counter({
  name: "ingest_events_accepted_total",
  help: "Total number of events accepted and enqueued for processing",
  labelNames: ["tenant_key", "metric", "data_profile", "scenario"] as const,
});

export const eventsRejectedTotal = new client.Counter({
  name: "ingest_events_rejected_total",
  help: "Total number of events rejected by ingest API",
  labelNames: [
    "tenant_key",
    "metric",
    "data_profile",
    "scenario",
    "reason",
  ] as const,
});

// HTTP request counter
export const httpRequestsTotal = new client.Counter({
  name: "ingest_http_requests_total",
  help: "Total number of HTTP requests to the ingest API",
  labelNames: ["method", "path", "status_code"] as const,
});

// HTTP request latency histogram (for P50/P95/P99)
export const httpRequestDurationMs = new client.Histogram({
  name: "ingest_request_latency_ms",
  help: "HTTP request latency for ingest API (in milliseconds)",
  labelNames: ["method", "path"] as const,
  // Example buckets; tweak as needed
  buckets: [5, 10, 20, 50, 100, 200, 500, 1000, 2000],
});

// Queue depth gauge
export const queueDepthGauge = new client.Gauge({
  name: "ingest_queue_depth",
  help: "Number of events currently waiting in the in-memory queue",
  labelNames: ["queue_name"] as const,
});

// Register all metrics with the registry
metricsRegistry.registerMetric(eventsReceivedTotal);
metricsRegistry.registerMetric(eventsAcceptedTotal);
metricsRegistry.registerMetric(eventsRejectedTotal);
metricsRegistry.registerMetric(httpRequestsTotal);
metricsRegistry.registerMetric(httpRequestDurationMs);
metricsRegistry.registerMetric(queueDepthGauge);

// ---------- HELPER FUNCTIONS ----------

// This is a tiny helper to consistently extract labels.
function getLabelsFromEvent(event: EventPayload) {
  const tenant_key = event.tenant_key || "unknown";
  const metric = event.metric || "unknown";
  const data_profile = event.data_profile || "unknown";
  const scenario = event.scenario || "unknown";
  return { tenant_key, metric, data_profile, scenario };
}

// Called when an event hits the ingest service (before validation)
export function recordEventReceived(event: EventPayload) {
  const { tenant_key, metric, data_profile, scenario } = getLabelsFromEvent(
    event
  );
  eventsReceivedTotal
    .labels(tenant_key, metric, data_profile, scenario)
    .inc();
}

// Called when an event passes validation and is enqueued
export function recordEventAccepted(event: EventPayload) {
  const { tenant_key, metric, data_profile, scenario } = getLabelsFromEvent(
    event
  );
  eventsAcceptedTotal
    .labels(tenant_key, metric, data_profile, scenario)
    .inc();
}

// Called when an event fails validation or processing
export function recordEventRejected(
  event: EventPayload,
  reason: "validation" | "simulated" | "queue_full" | "internal_error"
) {
  const { tenant_key, metric, data_profile, scenario } = getLabelsFromEvent(
    event
  );
  eventsRejectedTotal
    .labels(tenant_key, metric, data_profile, scenario, reason)
    .inc();
}

// Helper for HTTP metrics middleware
export function observeHttpRequest(
  method: string,
  path: string,
  statusCode: number,
  durationMs: number
) {
  httpRequestsTotal.labels(method, path, String(statusCode)).inc();
  httpRequestDurationMs.labels(method, path).observe(durationMs);
}

// Set queue depth from your in-memory queue
export function setQueueDepth(queueName: string, depth: number) {
  queueDepthGauge.labels(queueName).set(depth);
}

// Useful for /metrics endpoint (Prometheus scrape)
export async function getPrometheusMetrics(): Promise<string> {
  return metricsRegistry.metrics();
}

// Optional: JSON snapshot for /api/v1/metrics (debug)
export async function getMetricsDebugSnapshot() {
  // This returns a generic JSON structure of all metrics
  const metrics = await metricsRegistry.getMetricsAsJSON();
  return { metrics };
}
