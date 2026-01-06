// src/services/ingestService.ts
//
// Core business logic for ingest:
// - basic validation (shape + sanity checks)
// - optional simulated validation failure via flag
// - metrics updates
// - enqueue to queue backend
// - structured logging via Pino

import { EventPayload } from "../types/EventPayload";
import { ValidationError } from "../errors/ValidationError";
import { QueueFullError } from "../errors/QueueFullError";
import { eventQueue } from "../queue/eventQueue";
import {
  recordEventAccepted,
  recordEventReceived,
  recordEventRejected,
} from "../observability/metrics";
import { rootLogger } from "../observability/logger";
import { QueueMeta } from "../queue/types";

const SIMULATED_VALIDATION_RATE = Math.min(
  Math.max(Number(process.env.INGEST_SIMULATED_FAILURE_RATE || "0"), 0),
  1
);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function runValidations(event: EventPayload): void {
  // TODO: Validate against contracts/schemas/events.ingest.v1.schema.json (AJV).
  // TODO: Explore zod also and weigh between ajv and zod
  const requiredFields: (keyof EventPayload)[] = [
    "tenant_key",
    "event_id",
    "sensor_code",
    "metric",
    "value",
    "unit",
    "observed_at",
    "scenario",
    "data_profile",
  ];

  const missing = requiredFields.filter(
    (field) =>
      (event as any)[field] === undefined || (event as any)[field] === null
  );

  if (missing.length > 0) {
    throw new ValidationError(`Missing required fields: ${missing.join(", ")}`);
  }

  if (
    !isNonEmptyString(event.tenant_key) ||
    !isNonEmptyString(event.event_id) ||
    !isNonEmptyString(event.sensor_code) ||
    !isNonEmptyString(event.metric) ||
    !isNonEmptyString(event.unit) ||
    !isNonEmptyString(event.observed_at) ||
    !isNonEmptyString(event.scenario) ||
    !isNonEmptyString(event.data_profile)
  ) {
    throw new ValidationError("One or more string fields are empty or invalid");
  }

  if (!isFiniteNumber(event.value)) {
    throw new ValidationError("value must be a finite number");
  }

  const observedAt = new Date(event.observed_at);
  if (Number.isNaN(observedAt.getTime())) {
    throw new ValidationError("observed_at must be a valid ISO-8601 timestamp");
  }

  if (
    event.correlation_id !== undefined &&
    !isNonEmptyString(event.correlation_id)
  ) {
    throw new ValidationError("correlation_id must be a non-empty string");
  }

  if (event.trace_id !== undefined && !isNonEmptyString(event.trace_id)) {
    throw new ValidationError("trace_id must be a non-empty string");
  }

  if (
    event.tags !== undefined &&
    (typeof event.tags !== "object" ||
      event.tags === null ||
      Array.isArray(event.tags))
  ) {
    throw new ValidationError("tags must be an object when provided");
  }

  if (
    event.raw_payload !== undefined &&
    (typeof event.raw_payload !== "object" ||
      event.raw_payload === null ||
      Array.isArray(event.raw_payload))
  ) {
    throw new ValidationError("raw_payload must be an object when provided");
  }

  // TODO: Consider removing this in favor of k6-driven fault injection only.
  // Flag-controlled simulated validation failure for chaos testing.
  if (
    SIMULATED_VALIDATION_RATE > 0 &&
    Math.random() < SIMULATED_VALIDATION_RATE
  ) {
    throw new ValidationError(
      `Simulated validation failure (${SIMULATED_VALIDATION_RATE * 100}% rate)`
    );
  }
}

// Now accepts meta so we can pass correlationId/tenantKey to Kafka headers
export async function processEvent(
  event: EventPayload,
  meta?: QueueMeta
): Promise<void> {
  recordEventReceived(event);

  try {
    runValidations(event);
  } catch (err) {
    if (err instanceof ValidationError) {
      const reason = err.message.includes("Simulated")
        ? "simulated"
        : "validation";

      recordEventRejected(event, reason as any);

      rootLogger.warn(
        {
          event_id: event.event_id,
          tenant_key: event.tenant_key,
          sensor_code: event.sensor_code,
          metric: event.metric,
          scenario: event.scenario,
          data_profile: event.data_profile,
          validation_reason: err.message,
        },
        "validation_failed"
      );
    }

    throw err;
  }

  // "Accepted" means validation passed; enqueue can still fail and be rejected.
  recordEventAccepted(event);

  rootLogger.info(
    {
      event_id: event.event_id,
      tenant_key: event.tenant_key,
      sensor_code: event.sensor_code,
      metric: event.metric,
      value: event.value,
      unit: event.unit,
      scenario: event.scenario,
      data_profile: event.data_profile,
    },
    "event_accepted"
  );

  // enqueue with context (correlationId, tenantKey) so Kafka headers get it
  try {
    await eventQueue.enqueue(event, meta);
  } catch (err) {
    const reason =
      err instanceof QueueFullError ? "queue_full" : "internal_error";
    recordEventRejected(event, reason as any);

    rootLogger.error(
      {
        err,
        event_id: event.event_id,
        tenant_key: event.tenant_key,
        sensor_code: event.sensor_code,
        metric: event.metric,
        scenario: event.scenario,
        correlation_id: meta?.correlationId,
      },
      "queue_enqueue_failed"
    );

    throw err;
  }
}
