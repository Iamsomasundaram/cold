// src/server.js
const express = require("express");
const { config } = require("./config");
const { logger } = require("./logger");
const { register } = require("./metrics");
const { ping: dbPing } = require("./db");
const { connectKafka } = require("./kafka");
const { initSchemas } = require("./avro");
const { startConsumer } = require("./consumer");

async function bootstrap() {
  const app = express();

  // Simple health endpoint: checks DB connectivity
  app.get("/health", async (req, res) => {
    try {
      const dbOk = await dbPing();
      if (!dbOk) throw new Error("DB ping failed");

      res.json({ status: "ok", service: config.serviceName });
    } catch (err) {
      logger.error({ err }, "Health check failed");
      res.status(500).json({ status: "error", message: "Health check failed" });
    }
  });

  // Prometheus metrics endpoint
  app.get("/metrics", async (req, res) => {
    try {
      res.set("Content-Type", register.contentType);
      res.end(await register.metrics());
    } catch (err) {
      logger.error({ err }, "Failed to serve metrics");
      res.status(500).end();
    }
  });

  app.listen(config.port, () => {
    logger.info({ port: config.port }, "Detector HTTP server listening");
  });

  // Boot sequence: DB is lazy via pool; we explicitly init Kafka + Schema Registry + consumer.
  try {
    await connectKafka();
    if (config.detectedEncoding === "avro") {
      await initSchemas();
    } else {
      logger.info(
        { detectedEncoding: config.detectedEncoding },
        "Skipping Avro schema init; emitting JSON payloads"
      );
    }
    await startConsumer();

    logger.info(
      { service: config.serviceName },
      "Detector service started successfully"
    );
  } catch (err) {
    logger.error({ err }, "Detector service failed to start");
    process.exit(1);
  }
}

// Handle unhandled rejections / exceptions for safety
process.on("unhandledRejection", (err) => {
  logger.error({ err }, "Unhandled promise rejection");
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception");
  process.exit(1);
});

bootstrap();
