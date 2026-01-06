// src/detectorService.js
const {
  insertSensorReading,
  getTenantIdByKey,
  getSensorContext,
  getThresholdFor,
  insertViolation,
  getRecentReadings,
  getLatestReading,
} = require("./db");
const { encodeDetectedEvent } = require("./avro");
const { producer } = require("./kafka");
const { config } = require("./config");
const {
  kafkaConsumerMessagesTotal,
  detectorProcessingDuration,
  detectorViolationsTotal,
} = require("./metrics");
const { logger } = require("./logger");

/**
 * Our internal canonical shape for an ingest event.
 *
 * {
 *   tenantKey: string,
 *   eventId: string,
 *   sensorCode: string,
 *   metric: string,
 *   value: number,
 *   unit: string,
 *   observedAt: string | Date,
 *   scenario?: string | null,
 *   dataProfile?: string | null,
 *   correlationId?: string | null,
 *   traceId?: string | null,
 *   tags?: object | null,
 *   rawPayload?: object | null,
 *   location?: {
 *     siteName?: string | null,
 *     zone?: string | null,
 *     rack?: string | null,
 *   }
 * }
 *
 * We will accept multiple external formats and normalize them into this.
 */

/**
 * Detects whether the payload already looks like our canonical IoT-style event.
 */
function isCanonicalSensorEvent(payload) {
  return (
    typeof payload.eventId === "string" &&
    typeof payload.sensorCode === "string" &&
    typeof payload.metric === "string" &&
    payload.value !== undefined &&
    payload.unit !== undefined &&
    payload.observedAt !== undefined
  );
}

/**
 * Detects cold-storage telemetry payload (k6/ingest-api).
 */
function isColdStorageEventPayload(payload) {
  return (
    typeof payload.tenant_key === "string" &&
    typeof payload.event_id === "string" &&
    typeof payload.sensor_code === "string" &&
    typeof payload.metric === "string" &&
    payload.value !== undefined &&
    typeof payload.unit === "string" &&
    typeof payload.observed_at === "string"
  );
}

/**
 * Detects whether the payload is the payment-style EventPayload from ingest-api.
 *
 * {
 *   event_id: string;
 *   type: string;
 *   amount: number;
 *   currency: string;
 *   created_at: string;
 *   merchant_id: string;
 *   customer_id: string;
 *   channel: string;
 *   source_system: string;
 * }
 */
function isPaymentEventPayload(payload) {
  return (
    typeof payload.event_id === "string" &&
    typeof payload.merchant_id === "string" &&
    typeof payload.type === "string" &&
    payload.amount !== undefined &&
    typeof payload.currency === "string" &&
    typeof payload.created_at === "string"
  );
}

/**
 * Normalize external payload into our internal canonical ingest event.
 *
 * - If it's already canonical IoT-style -> return as-is (with defaults for location).
 * - If it's cold-storage telemetry -> map fields to canonical shape.
 * - If it's EventPayload from ingest-api -> map fields to canonical shape.
 * - Otherwise -> throw ValidationError.
 */
function normalizeIngestEvent(payload, meta = {}) {
  const getHeader = (name) => (meta.headers ? meta.headers[name] : null);
  // Ingest-api forwards these headers so we can enrich payloads consistently.
  const headerTenantKey = getHeader("x-tenant-key") || getHeader("x-tenant-id");
  const headerCorrelationId = getHeader("x-correlation-id");
  const headerScenario = getHeader("x-scenario");
  const headerDataProfile = getHeader("x-data-profile");

  // Case 1: already canonical IoT-style
  if (isCanonicalSensorEvent(payload)) {
    const location = payload.location || {};
    return {
      tenantKey:
        payload.tenantKey ||
        payload.tenant_key ||
        headerTenantKey ||
        null,
      eventId: payload.eventId,
      sensorCode: payload.sensorCode,
      metric: payload.metric,
      value: payload.value,
      unit: payload.unit,
      observedAt: payload.observedAt,
      scenario: payload.scenario || headerScenario || null,
      dataProfile:
        payload.dataProfile || payload.data_profile || headerDataProfile || null,
      correlationId:
        payload.correlationId ||
        payload.correlation_id ||
        headerCorrelationId ||
        null,
      traceId: payload.traceId || payload.trace_id || null,
      tags: payload.tags || null,
      rawPayload: payload.rawPayload || payload.raw_payload || null,
      location: {
        siteName: location.siteName || null,
        zone: location.zone || null,
        rack: location.rack || null,
      },
    };
  }

  // Case 2: cold-storage telemetry payload
  if (isColdStorageEventPayload(payload)) {
    return {
      tenantKey: payload.tenant_key || headerTenantKey || null,
      eventId: payload.event_id,
      sensorCode: payload.sensor_code,
      metric: payload.metric,
      value: payload.value,
      unit: payload.unit,
      observedAt: payload.observed_at,
      scenario: payload.scenario || headerScenario || null,
      dataProfile: payload.data_profile || headerDataProfile || null,
      correlationId: payload.correlation_id || headerCorrelationId || null,
      traceId: payload.trace_id || null,
      tags: payload.tags || null,
      rawPayload: payload.raw_payload || null,
      location: {
        siteName: null,
        zone: null,
        rack: null,
      },
    };
  }

  // Case 3: payment-style EventPayload from existing ingest-api
  if (isPaymentEventPayload(payload)) {
    return {
      tenantKey: headerTenantKey || null,
      eventId: payload.event_id,
      // Treat merchant as "sensor"
      sensorCode: payload.merchant_id,
      // For now use a single metric name "amount" for thresholding
      metric: "amount",
      value: payload.amount,
      unit: payload.currency,
      observedAt: payload.created_at,
      scenario: headerScenario || null,
      dataProfile: headerDataProfile || null,
      correlationId: headerCorrelationId || null,
      traceId: null,
      tags: null,
      rawPayload: null,
      location: {
        // Use channel / source / customer as pseudo-location metadata
        siteName: payload.channel || null,
        zone: payload.source_system || null,
        rack: payload.customer_id || null,
      },
    };
  }

  // Unknown format
  const err = new Error("Unsupported ingest payload format");
  err.name = "ValidationError";
  throw err;
}

/**
 * Validate canonical ingest event.
 */
function validateIngestEvent(event) {
  const required = [
    "tenantKey",
    "eventId",
    "sensorCode",
    "metric",
    "value",
    "unit",
    "observedAt",
  ];
  for (const field of required) {
    if (event[field] === undefined || event[field] === null) {
      const err = new Error(`Missing required field: ${field}`);
      err.name = "ValidationError";
      throw err;
    }
  }

  if (!Number.isFinite(event.value)) {
    const err = new Error("Invalid value: must be a finite number");
    err.name = "ValidationError";
    throw err;
  }

  const observedAt = new Date(event.observedAt);
  if (Number.isNaN(observedAt.getTime())) {
    const err = new Error("Invalid observedAt: must be ISO-8601 timestamp");
    err.name = "ValidationError";
    throw err;
  }

  if (
    event.scenario !== undefined &&
    event.scenario !== null &&
    typeof event.scenario !== "string"
  ) {
    const err = new Error("Invalid scenario: must be a string");
    err.name = "ValidationError";
    throw err;
  }

  if (
    event.dataProfile !== undefined &&
    event.dataProfile !== null &&
    typeof event.dataProfile !== "string"
  ) {
    const err = new Error("Invalid dataProfile: must be a string");
    err.name = "ValidationError";
    throw err;
  }

  if (
    event.correlationId !== undefined &&
    event.correlationId !== null &&
    typeof event.correlationId !== "string"
  ) {
    const err = new Error("Invalid correlationId: must be a string");
    err.name = "ValidationError";
    throw err;
  }

  if (
    event.traceId !== undefined &&
    event.traceId !== null &&
    typeof event.traceId !== "string"
  ) {
    const err = new Error("Invalid traceId: must be a string");
    err.name = "ValidationError";
    throw err;
  }

  if (
    event.tags !== undefined &&
    event.tags !== null &&
    (typeof event.tags !== "object" || Array.isArray(event.tags))
  ) {
    const err = new Error("Invalid tags: must be an object");
    err.name = "ValidationError";
    throw err;
  }

  if (
    event.rawPayload !== undefined &&
    event.rawPayload !== null &&
    (typeof event.rawPayload !== "object" || Array.isArray(event.rawPayload))
  ) {
    const err = new Error("Invalid rawPayload: must be an object");
    err.name = "ValidationError";
    throw err;
  }
}

/**
 * Simple helper: check if a value is outside [min, max].
 */
function isOutsideRange(value, min, max) {
  return value < min || value > max;
}

/**
 * Core processing for a single ingest event (raw payload from Kafka).
 *
 * Steps:
 *  1. Normalize payload into canonical format (supports multiple producers).
 *  2. Validate canonical event.
 *  3. Insert sensor_reading row.
 *  4. Lookup threshold and run sliding-window + multi-metric detection.
 *  5. Insert violation if needed.
 *  6. Produce Avro DetectedEvent to events.detected.v1.
 */
async function processIngestEvent(rawPayload, meta = {}) {
  const endTimer = detectorProcessingDuration.startTimer();
  const startTime = Date.now();

  try {
    // 1) Normalize external payload -> internal canonical shape
    const canonical = normalizeIngestEvent(rawPayload, meta);

    // 2) Validate canonical shape
    validateIngestEvent(canonical);

    const {
      tenantKey,
      eventId,
      sensorCode,
      metric,
      value,
      unit,
      observedAt,
      scenario,
      dataProfile,
      correlationId,
      traceId,
      tags,
      rawPayload: rawPayloadField,
      location = {},
    } = canonical;

    const ingestedAt = new Date();

    const tenant = await getTenantIdByKey(tenantKey);
    if (!tenant) {
      const err = new Error(`Unknown tenant_key: ${tenantKey}`);
      err.name = "ValidationError";
      throw err;
    }

    const sensorContext = await getSensorContext(tenant.tenant_id, sensorCode);
    if (!sensorContext) {
      const err = new Error(
        `Unknown sensor_code for tenant ${tenantKey}: ${sensorCode}`
      );
      err.name = "ValidationError";
      throw err;
    }

    const rawPayloadToStore =
      rawPayloadField !== undefined && rawPayloadField !== null
        ? rawPayloadField
        : rawPayload;

    const readingRow = await insertSensorReading({
      eventId,
      tenantId: tenant.tenant_id,
      sensorId: sensorContext.id,
      sensorCode,
      metric,
      value,
      unit,
      observedAt: new Date(observedAt),
      ingestedAt,
      correlationId: correlationId || null,
      traceId: traceId || null,
      scenario: scenario || null,
      dataProfile: dataProfile || null,
      tags: tags || null,
      // Always store original raw payload for audit/debug
      rawPayload: rawPayloadToStore,
      kafkaTopic: meta.topic || null,
      kafkaPartition: meta.partition || null,
      kafkaOffset: meta.offset || null,
    });

    // IMPORTANT: pg returns BIGSERIAL (bigint) as string by default.
    // Avro "long" expects a JS number → convert explicitly.
    const readingId = Number(readingRow.id);

    // Defensive check: in case PG config changes in future
    if (Number.isNaN(readingId)) {
      const err = new Error(
        `Invalid readingId, cannot convert to number: ${readingRow.id}`
      );
      err.name = "ValidationError";
      throw err;
    }

    // 4) Lookup threshold rule (if available)
    const threshold = await getThresholdFor(
      tenant.tenant_id,
      sensorContext.id,
      sensorContext.location_id,
      sensorContext.sensor_type,
      metric
    );

    let severity = "INFO";
    let violationType = null;
    let expectedMin = null;
    let expectedMax = null;
    let ruleVersion = null;
    let hasViolation = false;
    let violationRow = null;

    if (threshold) {
      expectedMin = threshold.min_value;
      expectedMax = threshold.max_value;
      ruleVersion = threshold.rule_version;

      if (isOutsideRange(value, expectedMin, expectedMax)) {
        hasViolation = true;

        // Sliding window: how many recent readings for this sensor+metric are outside?
        const recent = await getRecentReadings(
          tenant.tenant_id,
          sensorCode,
          metric,
          3
        );
        const outsideCount = recent.filter((r) =>
          isOutsideRange(r.value, expectedMin, expectedMax)
        ).length;

        severity = outsideCount >= 3 ? "CRITICAL" : "WARN";
        violationType = value > expectedMax ? "ABOVE_MAX" : "BELOW_MIN";

        // Multi-metric example: if our metric is "amount" and we later add another
        // metric (e.g., "count" or "velocity"), we can look it up here similarly
        // to how we did TEMP+HUMIDITY. For now, we leave that part as is.

        violationRow = await insertViolation({
          tenantId: tenant.tenant_id,
          readingId,
          ruleId: threshold.id,
          violationType,
          severity,
          expectedMin,
          expectedMax,
          actualValue: value,
        });

        detectorViolationsTotal.inc({
          severity,
          violation_type: violationType,
        });

        logger.warn(
          {
            eventId,
            readingId,
            violationId: violationRow.id,
            tenantKey,
            sensorCode,
            metric,
            value,
            severity,
            violationType,
            outsideCount,
          },
          "Violation detected for reading"
        );
      }
    }

    // When building the DetectedEvent payload:
    const violationId = violationRow ? Number(violationRow.id) : null;
    if (violationRow && Number.isNaN(violationId)) {
      const err = new Error(
        `Invalid violationId, cannot convert to number: ${violationRow.id}`
      );
      err.name = "ValidationError";
      throw err;
    }

    // 5) Build DetectedEvent payload (shared for Avro/JSON)
    const detectedEvent = {
      tenantKey,
      eventId,
      readingId,
      violationId,
      sensorCode,
      metric,
      value,
      unit,
      observedAt: new Date(observedAt).getTime(),
      detectedAt: startTime,
      scenario: scenario || null,
      dataProfile: dataProfile || null,
      correlationId: correlationId || null,
      traceId: traceId || null,
      tags: tags || null,
      hasViolation,
      severity,
      violationType,
      expectedMin,
      expectedMax,
      location: {
        siteName: sensorContext.site_name || location.siteName || null,
        zone: sensorContext.zone || location.zone || null,
        rack: sensorContext.rack || location.rack || null,
      },
      ruleVersion,
    };

    let valueBuffer;
    const headers = {};
    if (config.detectedEncoding === "json") {
      headers["content-type"] = "application/json";
      valueBuffer = Buffer.from(JSON.stringify(detectedEvent));
    } else {
      headers["content-type"] = "avro/binary";
      // Avro encode will now see proper "long" values
      valueBuffer = await encodeDetectedEvent(detectedEvent);
    }

    await producer.send({
      topic: config.detectedTopic,
      messages: [
        {
          key: sensorCode,
          value: valueBuffer,
          headers,
        },
      ],
    });

    kafkaConsumerMessagesTotal.inc({ result: "success" });
    endTimer();

    return detectedEvent;
  } catch (err) {
    endTimer();

    logger.error(
      {
        err,
        eventId: rawPayload && (rawPayload.eventId || rawPayload.event_id),
        tenantKey: rawPayload && (rawPayload.tenantKey || rawPayload.tenant_key),
      },
      "Failed to process ingest event"
    );

    const isValidation = err.name === "ValidationError";
    kafkaConsumerMessagesTotal.inc({
      result: isValidation ? "validation_failed" : "db_failed",
    });

    throw err;
  }
}

module.exports = {
  processIngestEvent,
};
