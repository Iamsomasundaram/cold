// src/kafka.js
const { Kafka } = require("kafkajs");
const { config } = require("./config");
const { logger } = require("./logger");

const kafka = new Kafka({
  clientId: config.kafkaClientId,
  brokers: config.kafkaBrokers,
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: config.kafkaGroupId });

async function connectKafka() {
  logger.info(
    {
      brokers: config.kafkaBrokers,
      groupId: config.kafkaGroupId,
    },
    "Connecting to Kafka..."
  );

  await producer.connect();
  await consumer.connect();

  logger.info("Kafka producer and consumer connected");
}

/**
 * Send a failed message to DLQ with context.
 */
async function sendToDlq(reason, originalPayload, context) {
  try {
    await producer.send({
      topic: config.dlqTopic,
      messages: [
        {
          key: context.key || null,
          value: Buffer.from(
            JSON.stringify({
              reason,
              errorMessage: context.errorMessage,
              originalPayload,
              kafkaContext: {
                topic: context.topic,
                partition: context.partition,
                offset: context.offset,
              },
            })
          ),
        },
      ],
    });

    logger.warn(
      {
        dlqTopic: config.dlqTopic,
        reason,
        topic: context.topic,
        partition: context.partition,
        offset: context.offset,
      },
      "Message sent to DLQ"
    );
  } catch (err) {
    // Last resort: log and move on. We don't want DLQ failure to crash the service.
    logger.error({ err, reason }, "Failed to send message to DLQ");
  }
}

module.exports = {
  kafka,
  producer,
  consumer,
  connectKafka,
  sendToDlq,
};
