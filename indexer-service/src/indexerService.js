// src/indexerService.js
const { decodeDetectedEvent } = require("./avro");
const { producer } = require("./kafka");
const { config } = require("./config");
const { esClient } = require("./elastic");
const { indexerMessagesTotal, indexerIndexDuration } = require("./metrics");
const { logger } = require("./logger");

/**
 * Transform decoded DetectedEvent into Elasticsearch document shape.
 * We keep naming consistent with ES mapping (snake_case for fields).
 */
function buildEsDocument(detectedEvent) {
  const {
    eventId,
    readingId,
    violationId,
    sensorCode,
    metric,
    value,
    unit,
    observedAt,
    detectedAt,
    hasViolation,
    severity,
    violationType,
    expectedMin,
    expectedMax,
    location,
    ruleVersion,
  } = detectedEvent;

  const tenantKey =
    detectedEvent.tenantKey || detectedEvent.tenant_key || null;
  const scenario = detectedEvent.scenario || null;
  const dataProfile =
    detectedEvent.dataProfile || detectedEvent.data_profile || null;
  const correlationId =
    detectedEvent.correlationId || detectedEvent.correlation_id || null;
  const traceId = detectedEvent.traceId || detectedEvent.trace_id || null;
  const tags = detectedEvent.tags || null;

  return {
    tenant_key: tenantKey,
    event_id: eventId,
    reading_id: readingId,
    violation_id: violationId,
    sensor_code: sensorCode,
    metric,
    value,
    unit,
    has_violation: hasViolation,
    severity,
    violation_type: violationType,
    expected_min: expectedMin,
    expected_max: expectedMax,
    observed_at: observedAt, // epoch millis
    detected_at: detectedAt, // epoch millis
    scenario,
    data_profile: dataProfile,
    correlation_id: correlationId,
    trace_id: traceId,
    tags,
    location: {
      site_name: location && location.siteName ? location.siteName : null,
      zone: location && location.zone ? location.zone : null,
      rack: location && location.rack ? location.rack : null,
    },
    rule_version: ruleVersion,
  };
}

function getHeaderValue(headers, name) {
  if (!headers) return null;
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== target) continue;
    if (value === undefined || value === null) return null;
    return Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
  }
  return null;
}

function isConfluentAvroPayload(buffer) {
  // Confluent wire format starts with magic byte 0 + 4-byte schema id.
  return Buffer.isBuffer(buffer) && buffer.length > 5 && buffer[0] === 0;
}

async function decodeDetectedPayload(message) {
  const contentType = getHeaderValue(message.headers, "content-type");
  const encodingHint = contentType ? contentType.toLowerCase() : "";
  const rawBuffer = message.value;

  const tryJson = () => {
    if (!rawBuffer || rawBuffer.length === 0) {
      throw new Error("Detected payload is empty");
    }
    const rawText = rawBuffer.toString("utf8");
    return JSON.parse(rawText);
  };

  const tryAvro = () => {
    if (!rawBuffer || rawBuffer.length === 0) {
      throw new Error("Detected payload is empty");
    }
    return decodeDetectedEvent(rawBuffer);
  };

  // Prefer JSON because detector defaults to JSON; fall back to Avro for legacy.
  const configuredEncoding = config.detectedEncoding || "json";
  let decodeOrder;
  if (encodingHint.includes("json")) {
    decodeOrder = ["json", "avro"];
  } else if (encodingHint.includes("avro")) {
    decodeOrder = ["avro", "json"];
  } else if (configuredEncoding === "avro") {
    decodeOrder = ["avro", "json"];
  } else if (configuredEncoding === "auto") {
    decodeOrder = isConfluentAvroPayload(rawBuffer)
      ? ["avro", "json"]
      : ["json", "avro"];
  } else {
    decodeOrder = ["json", "avro"];
  }

  let lastError;
  for (const decoder of decodeOrder) {
    try {
      if (decoder === "json") return tryJson();
      return await tryAvro();
    } catch (err) {
      lastError = err;
      logger.warn(
        { err, contentType },
        `${decoder.toUpperCase()} detected event decode failed`
      );
    }
  }

  throw lastError || new Error("Detected payload decode failed");
}

/**
 * Send a failed detected event to the Indexer DLQ topic.
 */
async function sendToDlq(reason, kafkaMessage, error, decodedPayload) {
  const payload = {
    reason,
    errorMessage: error.message,
    // Optional: we can include decoded payload if decode succeeded
    detectedEvent: decodedPayload || null,
    kafkaContext: {
      topic: kafkaMessage.topic,
      partition: kafkaMessage.partition,
      offset: kafkaMessage.offset,
      key: kafkaMessage.message.key
        ? kafkaMessage.message.key.toString()
        : null,
      timestamp: kafkaMessage.message.timestamp,
    },
  };

  const value = Buffer.from(JSON.stringify(payload));

  await producer.send({
    topic: config.dlqTopic,
    messages: [
      {
        // Keep same key for easier correlation, if present
        key: kafkaMessage.message.key || null,
        value,
      },
    ],
  });

  logger.warn(
    {
      dlqTopic: config.dlqTopic,
      reason,
      topic: kafkaMessage.topic,
      partition: kafkaMessage.partition,
      offset: kafkaMessage.offset,
    },
    "Message sent to Indexer DLQ"
  );
}

/**
 * Process one Kafka message from events.detected.v1:
 *  - decode Avro
 *  - build ES document
 *  - index into Elasticsearch
 */
async function processDetectedMessage({ topic, partition, message }) {
  // Wrap with labels for metrics
  const endTimer = indexerIndexDuration.startTimer();

  // Wrap everything in try/catch so we can DLQ on failure.
  try {
    // 1) Decode payload (Avro or JSON)
    let detectedEvent;
    try {
      detectedEvent = await decodeDetectedPayload(message);
    } catch (err) {
      indexerMessagesTotal.inc({ result: "decode_failed" });
      endTimer({ result: "decode_failed" });

      await sendToDlq(
        "DECODE_FAILED",
        { topic, partition, message, offset: message.offset },
        err,
        null
      );
      return;
    }

    // 2) Build ES document
    const doc = buildEsDocument(detectedEvent);

    // 3) Index into Elasticsearch (idempotent on reading_id)
    // Use reading_id as ES document id so replays are idempotent.
    const esId =
      detectedEvent.readingId != null
        ? String(detectedEvent.readingId)
        : undefined;

    await esClient.index({
      index: config.esIndex,
      id: esId, // if undefined, ES will generate an id
      document: doc,
      op_type: "index", // "index" is upsert-like
    });

    indexerMessagesTotal.inc({ result: "success" });
    endTimer({ result: "success" });

    logger.info(
      {
        topic,
        partition,
        offset: message.offset,
        eventId: detectedEvent.eventId,
        readingId: detectedEvent.readingId,
        severity: detectedEvent.severity,
        hasViolation: detectedEvent.hasViolation,
      },
      "Indexed DetectedEvent into Elasticsearch"
    );
  } catch (err) {
    // ES or unexpected errors land here
    indexerMessagesTotal.inc({ result: "es_failed" });
    endTimer({ result: "es_failed" });

    logger.error(
      {
        err,
        topic,
        partition,
        offset: message.offset,
      },
      "Failed to index DetectedEvent"
    );

    await sendToDlq(
      "INDEX_FAILED",
      { topic, partition, message, offset: message.offset },
      err,
      null // we don't pass decoded payload here for now; can be added if needed
    );
  }
}

module.exports = {
  processDetectedMessage,
};
