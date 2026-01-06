// src/elastic.js
const { Client } = require("@elastic/elasticsearch");
const { config } = require("./config");
const { logger } = require("./logger");

// ES client – single node, no auth (we disabled security in Docker)
const esClient = new Client({
  node: config.esNode,
});

/**
 * Ensure the target index exists with a reasonable mapping.
 * For local dev this can be a simple up-front call on startup.
 */
async function ensureIndexExists() {
  const index = config.esIndex;

  const existsResponse = await esClient.indices.exists({ index });
  const exists =
    typeof existsResponse === "boolean"
      ? existsResponse
      : Boolean(existsResponse && existsResponse.body);

  if (exists) {
    logger.info({ index }, "Elasticsearch index already exists");
    return;
  }

  logger.info({ index }, "Creating Elasticsearch index");

  await esClient.indices.create({
    index,
    body: {
      mappings: {
        properties: {
          tenant_key: { type: "keyword" },
          event_id: { type: "keyword" },
          reading_id: { type: "long" },
          violation_id: { type: "long" },
          sensor_code: { type: "keyword" },
          metric: { type: "keyword" },
          value: { type: "double" },
          unit: { type: "keyword" },
          has_violation: { type: "boolean" },
          severity: { type: "keyword" },
          violation_type: { type: "keyword" },
          expected_min: { type: "double" },
          expected_max: { type: "double" },
          observed_at: { type: "date", format: "epoch_millis" },
          detected_at: { type: "date", format: "epoch_millis" },
          scenario: { type: "keyword" },
          data_profile: { type: "keyword" },
          correlation_id: { type: "keyword" },
          trace_id: { type: "keyword" },
          tags: { type: "object" },
          location: {
            properties: {
              site_name: { type: "keyword" },
              zone: { type: "keyword" },
              rack: { type: "keyword" },
            },
          },
          rule_version: { type: "keyword" },
        },
      },
    },
  });

  logger.info({ index }, "Elasticsearch index created");
}

module.exports = {
  esClient,
  ensureIndexExists,
};
