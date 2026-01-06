// src/metrics.js
// Prometheus metrics for indexer-service.

const client = require("prom-client");

const register = new client.Registry();

// Collect default Node.js process metrics
client.collectDefaultMetrics({ register });

// Counter: how many messages we processed, labelled by result type.
const indexerMessagesTotal = new client.Counter({
  name: "indexer_messages_total",
  help: "Total number of detected events processed by the indexer",
  labelNames: ["result"], // success | decode_failed | es_failed
});

// Histogram: ES indexing latency.
const indexerIndexDuration = new client.Histogram({
  name: "indexer_index_duration_seconds",
  help: "Time spent indexing documents into Elasticsearch",
  labelNames: ["result"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
});

// Register custom metrics
register.registerMetric(indexerMessagesTotal);
register.registerMetric(indexerIndexDuration);

module.exports = {
  register,
  indexerMessagesTotal,
  indexerIndexDuration,
};
