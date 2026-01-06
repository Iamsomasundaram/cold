// src/consumer.js
const { consumer, sendToDlq } = require("./kafka");
const { config } = require("./config");
const { processIngestEvent } = require("./detectorService");
const { logger } = require("./logger");
const { kafkaDlqMessagesTotal } = require("./metrics");

/**
 * Starts the Kafka consumer that listens to events.ingest.v1
 * and dispatches each message to the detector service.
 */
async function startConsumer() {
  await consumer.subscribe({
    topic: config.ingestTopic,
    fromBeginning: false,
  });

  logger.info(
    { topic: config.ingestTopic, groupId: config.kafkaGroupId },
    "Detector consumer subscribed to topic"
  );

  await consumer.run({
    // We keep it simple with eachMessage; you can move to eachBatch later if needed.
    eachMessage: async ({ topic, partition, message }) => {
      const key = message.key ? message.key.toString() : null;
      const headers = {};
      if (message.headers) {
        for (const [name, value] of Object.entries(message.headers)) {
          if (value === undefined || value === null) continue;
          headers[name] = Buffer.isBuffer(value)
            ? value.toString("utf8")
            : String(value);
        }
      }
      let payload;

      // 1) JSON parsing
      try {
        // Ingest API currently sends JSON
        payload = JSON.parse(message.value.toString("utf8"));
      } catch (err) {
        const ctx = {
          key,
          topic,
          partition,
          offset: message.offset,
          errorMessage: err.message,
        };

        logger.error(
          { ...ctx },
          "Failed to parse JSON from ingest topic. Sending to DLQ."
        );
        await sendToDlq(
          "JSON_PARSE_ERROR",
          message.value.toString("utf8"),
          ctx
        );
        kafkaDlqMessagesTotal.inc({ reason: "JSON_PARSE_ERROR" });
        return; // do NOT throw -> we commit offset and move on
      }

      logger.debug(
        {
          topic,
          partition,
          offset: message.offset,
          key,
          eventId: payload.event_id || payload.eventId,
          tenantKey: payload.tenant_key || payload.tenantKey,
        },
        "Received ingest event from Kafka"
      );

      // 2) Business processing
      try {
        await processIngestEvent(payload, {
          topic,
          partition,
          offset: message.offset,
          key,
          headers,
        });
      } catch (err) {
        const ctx = {
          key,
          topic,
          partition,
          offset: message.offset,
          errorMessage: err.message,
        };

        const reason =
          err.name === "ValidationError"
            ? "VALIDATION_FAILED"
            : "PROCESSING_ERROR";

        logger.error(
          { ...ctx, err },
          "Failed to process ingest event. Sending to DLQ."
        );

        await sendToDlq(reason, payload, ctx);
        kafkaDlqMessagesTotal.inc({ reason });

        // We do NOT rethrow here; for now, all failures go to DLQ.
        // Later, we can distinguish transient vs permanent errors and rethrow only transient ones.
      }
    },
  });
}

module.exports = {
  startConsumer,
};
