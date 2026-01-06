// src/config.js

// Helper to read required env vars with a clear error message
function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Helper: pick a reasonable default for Schema Registry
// - In dev (running on host): use localhost:8081
// - In docker (we'll override with env: SCHEMA_REGISTRY_URL=http://schema-registry:8081)
function getDefaultSchemaRegistryUrl() {
  const nodeEnv = process.env.NODE_ENV || "development";

  if (nodeEnv === "development") {
    // When you run `node src/server.js` on your laptop
    return "http://localhost:8081";
  }

  // When running inside Docker network, other containers can reach "schema-registry"
  return "http://schema-registry:8081";
}

function getDetectedEncoding() {
  const val = (process.env.DETECTED_ENCODING || "json").toLowerCase();
  if (val === "avro" || val === "json") {
    return val;
  }
  throw new Error(`Unsupported DETECTED_ENCODING: ${val}`);
}

const config = {
  // Basic service info
  serviceName: process.env.SERVICE_NAME || "detector-service",
  env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "4001", 10),

  // Kafka
  kafkaBrokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
  kafkaClientId: process.env.KAFKA_CLIENT_ID || "detector-service",
  kafkaGroupId: process.env.KAFKA_GROUP_ID || "coldstore-detector-v1",
  ingestTopic: process.env.INGEST_TOPIC || "events.ingest.v1",
  detectedTopic: process.env.DETECTED_TOPIC || "events.detected.v1",
  dlqTopic: process.env.DLQ_TOPIC || "events.ingest.dlq.v1",

  // Schema Registry
  schemaRegistryUrl:
    process.env.SCHEMA_REGISTRY_URL || getDefaultSchemaRegistryUrl(),
  detectedEncoding: getDetectedEncoding(), // avro | json

  // Postgres
  pg: {
    host: process.env.PG_HOST || "localhost",
    port: parseInt(process.env.PG_PORT || "5432", 10),
    database: "coldstore",
    user: "coldstore",
    password: "coldstore",
    // database: requireEnv("PG_DATABASE"),
    // user: requireEnv("PG_USER"),
    // password: requireEnv("PG_PASSWORD"),
    ssl: process.env.PG_SSL === "true",
  },
};

module.exports = { config, requireEnv };
