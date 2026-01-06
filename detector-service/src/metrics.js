// src/metrics.js
const client = require("prom-client");

// Use a single registry for the service
const register = new client.Registry();

// Default metrics (process_cpu_seconds_total, etc.)
client.collectDefaultMetrics({ register });

// Kafka consumer metrics
const kafkaConsumerMessagesTotal = new client.Counter({
  name: "kafka_consumer_messages_total",
  help: "Total messages processed by detector consumer",
  labelNames: ["result"], // success | validation_failed | db_failed | avro_failed
});

const detectorProcessingDuration = new client.Histogram({
  name: "detector_processing_duration_seconds",
  help: "End-to-end processing time of ingest event in detector",
  buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

const detectorViolationsTotal = new client.Counter({
  name: "detector_violations_total",
  help: "Number of violations detected",
  labelNames: ["severity", "violation_type"],
});

const kafkaDlqMessagesTotal = new client.Counter({
  name: "kafka_dlq_messages_total",
  help: "Total messages sent to DLQ by detector",
  labelNames: ["reason"],
});

// Register all metrics
register.registerMetric(kafkaConsumerMessagesTotal);
register.registerMetric(detectorProcessingDuration);
register.registerMetric(detectorViolationsTotal);
register.registerMetric(kafkaDlqMessagesTotal);

module.exports = {
  register,
  kafkaConsumerMessagesTotal,
  detectorProcessingDuration,
  detectorViolationsTotal,
  kafkaDlqMessagesTotal,
};
