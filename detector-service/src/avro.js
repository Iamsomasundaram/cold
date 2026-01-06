// src/avro.js
const {
  SchemaRegistry,
  SchemaType,
} = require("@kafkajs/confluent-schema-registry");
const { config } = require("./config");
const { logger } = require("./logger");

const registry = new SchemaRegistry({
  host: config.schemaRegistryUrl,
});

// Avro schema (same as before)
const detectedEventSchema = {
  type: "record",
  name: "DetectedEvent",
  namespace: "coldstore.detector",
  fields: [
    { name: "eventId", type: "string" },
    { name: "readingId", type: "long" },
    { name: "violationId", type: ["null", "long"], default: null },
    { name: "sensorCode", type: "string" },
    { name: "metric", type: "string" },
    { name: "value", type: "double" },
    { name: "unit", type: "string" },
    { name: "observedAt", type: "long" },
    { name: "detectedAt", type: "long" },
    { name: "hasViolation", type: "boolean", default: false },
    {
      name: "severity",
      type: {
        type: "enum",
        name: "Severity",
        symbols: ["INFO", "WARN", "CRITICAL"],
      },
    },
    { name: "violationType", type: ["null", "string"], default: null },
    { name: "expectedMin", type: ["null", "double"], default: null },
    { name: "expectedMax", type: ["null", "double"], default: null },
    {
      name: "location",
      type: [
        "null",
        {
          type: "record",
          name: "Location",
          fields: [
            { name: "siteName", type: ["null", "string"], default: null },
            { name: "zone", type: ["null", "string"], default: null },
            { name: "rack", type: ["null", "string"], default: null },
          ],
        },
      ],
      default: null,
    },
    { name: "ruleVersion", type: ["null", "string"], default: null },
    { name: "tenantKey", type: ["null", "string"], default: null },
    { name: "scenario", type: ["null", "string"], default: null },
    { name: "dataProfile", type: ["null", "string"], default: null },
    { name: "correlationId", type: ["null", "string"], default: null },
    { name: "traceId", type: ["null", "string"], default: null },
    {
      name: "tags",
      type: ["null", { type: "map", values: "string" }],
      default: null,
    },
  ],
};

let detectedEventSchemaId;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Register the DetectedEvent schema on startup and cache the schema ID.
 * Includes retry logic so we don't die just because Schema Registry is
 * still starting up.
 */
async function initSchemas() {
  const maxAttempts = 10;
  const delayMs = 2000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logger.info(
        {
          registryUrl: config.schemaRegistryUrl,
          attempt,
          maxAttempts,
        },
        "Registering Avro schema for DetectedEvent..."
      );

      const { id } = await registry.register(
        {
          type: SchemaType.AVRO,
          schema: JSON.stringify(detectedEventSchema),
        },
        {
          subject: "events.detected.v1-value",
        }
      );

      detectedEventSchemaId = id;

      logger.info(
        { schemaId: detectedEventSchemaId },
        "DetectedEvent schema registered successfully"
      );
      return; // success
    } catch (err) {
      logger.error(
        { err, attempt, registryUrl: config.schemaRegistryUrl },
        "Failed to register DetectedEvent schema"
      );

      if (attempt === maxAttempts) {
        // After last attempt, let the error bubble up and crash the service
        throw err;
      }

      await delay(delayMs);
    }
  }
}

async function encodeDetectedEvent(payload) {
  if (!detectedEventSchemaId) {
    throw new Error("DetectedEvent schema is not initialized yet");
  }
  return registry.encode(detectedEventSchemaId, payload);
}

module.exports = {
  registry,
  initSchemas,
  encodeDetectedEvent,
};
