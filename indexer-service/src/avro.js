// src/avro.js
// Avro decoding for DetectedEvent using Schema Registry.

const { SchemaRegistry } = require("@kafkajs/confluent-schema-registry");
const { config } = require("./config");
const { logger } = require("./logger");

// We don't register schemas here; we just decode whatever is on the wire.
const registry = new SchemaRegistry({
  host: config.schemaRegistryUrl,
});

/**
 * Decode a Kafka message value (Buffer) into a DetectedEvent object.
 * Throws if decoding fails (e.g., invalid payload or unknown schema).
 */
async function decodeDetectedEvent(buffer) {
  try {
    const decoded = await registry.decode(buffer);
    // For safety, ensure we always return a plain JS object
    return decoded;
  } catch (err) {
    logger.error(
      { err, registryUrl: config.schemaRegistryUrl },
      "Failed to decode Avro DetectedEvent payload"
    );
    throw err;
  }
}

module.exports = {
  registry,
  decodeDetectedEvent,
};
