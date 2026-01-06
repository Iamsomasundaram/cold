// src/kafka.js
const { Kafka, logLevel } = require("kafkajs");
const { config } = require("./config");
const { logger } = require("./logger");

// Bridge KafkaJS logs into our pino logger
function createKafkaLogger() {
  return ({ namespace, level, label, log }) => {
    const { message, ...extra } = log;
    const mapped = {
      trace: "debug",
      debug: "debug",
      info: "info",
      warn: "warn",
      error: "error",
      nothing: "silent",
    }[label];

    if (!mapped || !logger[mapped]) return;
    logger[mapped](
      {
        ...extra,
        namespace,
      },
      message
    );
  };
}

const kafka = new Kafka({
  clientId: config.kafkaClientId,
  brokers: config.kafkaBrokers,
  logLevel: logLevel.INFO,
  logCreator: () => createKafkaLogger(),
});

const consumer = kafka.consumer({ groupId: config.kafkaGroupId });
const producer = kafka.producer();

// Connect helpers so index.js can call once on startup
async function connectKafka() {
  logger.info(
    { brokers: config.kafkaBrokers, groupId: config.kafkaGroupId },
    "Connecting to Kafka..."
  );
  await producer.connect();
  await consumer.connect();
  logger.info("Kafka producer and consumer connected (indexer)");
}

async function disconnectKafka() {
  await consumer.disconnect();
  await producer.disconnect();
}

module.exports = {
  kafka,
  consumer,
  producer,
  connectKafka,
  disconnectKafka,
};
