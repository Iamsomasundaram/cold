// src/config.js
// Centralized configuration for indexer-service.
// Reads from env vars with sensible defaults for local dev.

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getDefaultSchemaRegistryUrl() {
  const nodeEnv = process.env.NODE_ENV || "development";
  if (nodeEnv === "development") {
    return "http://localhost:8081";
  }
  // In Docker, we'll typically talk to schema-registry:8081
  return "http://schema-registry:8081";
}

function getDefaultEsNode() {
  const nodeEnv = process.env.NODE_ENV || "development";
  if (nodeEnv === "development") {
    return "http://localhost:9200";
  }
  return "http://elasticsearch:9200";
}

function normalizeDetectedEncoding(value) {
  if (!value) return "json";
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "json" || normalized === "avro" || normalized === "auto") {
    return normalized;
  }
  return "json";
}

const config = {
  serviceName: process.env.SERVICE_NAME || "indexer-service",
  env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "4002", 10),

  // Kafka
  kafkaBrokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
  kafkaClientId: process.env.KAFKA_CLIENT_ID || "indexer-service",
  kafkaGroupId: process.env.KAFKA_GROUP_ID || "coldstore-indexer-v1",
  detectedTopic: process.env.DETECTED_TOPIC || "events.detected.v1",
  dlqTopic: process.env.INDEXER_DLQ_TOPIC || "events.detected.dlq.v1",
  detectedEncoding: normalizeDetectedEncoding(process.env.DETECTED_ENCODING),

  // Schema Registry
  schemaRegistryUrl:
    process.env.SCHEMA_REGISTRY_URL || getDefaultSchemaRegistryUrl(),

  // Elasticsearch
  esNode: process.env.ES_NODE_URL || getDefaultEsNode(),
  esIndex: process.env.ES_INDEX || "coldstore-detected-events",
};

module.exports = { config, requireEnv };
