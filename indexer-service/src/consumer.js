// src/consumer.js
const { consumer } = require("./kafka");
const { config } = require("./config");
const { logger } = require("./logger");
const { processDetectedMessage } = require("./indexerService");

/**
 * Run the indexer Kafka consumer.
 * Subscribes to events.detected.v1 and processes each message.
 */
async function runIndexerConsumer() {
  await consumer.subscribe({
    topic: config.detectedTopic,
    fromBeginning: false, // start from end for dev; change to true for replay
  });

  logger.info(
    {
      topic: config.detectedTopic,
      groupId: config.kafkaGroupId,
    },
    "Starting indexer consumer loop"
  );

  await consumer.run({
    // You can tune concurrency here if needed
    eachMessage: async ({ topic, partition, message }) => {
      await processDetectedMessage({ topic, partition, message });
    },
  });
}

module.exports = {
  runIndexerConsumer,
};
