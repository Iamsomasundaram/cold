// src/index.js
const { config } = require("./config");
const { logger } = require("./logger");
const { connectKafka, disconnectKafka } = require("./kafka");
const { ensureIndexExists } = require("./elastic");
const { runIndexerConsumer } = require("./consumer");
const { createHttpServer } = require("./server");

async function main() {
  try {
    logger.info(
      { service: config.serviceName, env: config.env },
      "Starting indexer-service..."
    );

    // 1) Ensure ES index exists
    await ensureIndexExists();

    // 2) Connect to Kafka (producer + consumer)
    await connectKafka();

    // 3) Start HTTP server for health & metrics
    const server = createHttpServer();

    // 4) Start consumer loop (async)
    runIndexerConsumer().catch((err) => {
      logger.error({ err }, "Indexer consumer crashed");
      process.exitCode = 1;
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.warn({ signal }, "Shutting down indexer-service...");
      try {
        await disconnectKafka();
        server.close(() => {
          logger.info("HTTP server closed");
          process.exit(0);
        });
      } catch (err) {
        logger.error({ err }, "Error during shutdown");
        process.exit(1);
      }
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (err) {
    logger.error({ err }, "Indexer service failed to start");
    process.exit(1);
  }
}

main();
