// src/server.js
const express = require("express");
const { config } = require("./config");
const { logger } = require("./logger");
const { register } = require("./metrics");

/**
 * Create and start the HTTP server exposing /health and /metrics.
 */
function createHttpServer() {
  const app = express();

  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      service: config.serviceName,
      env: config.env,
    });
  });

  app.get("/metrics", async (req, res) => {
    try {
      res.set("Content-Type", register.contentType);
      const metrics = await register.metrics();
      res.send(metrics);
    } catch (err) {
      logger.error({ err }, "Failed to collect metrics");
      res.status(500).send("Failed to collect metrics");
    }
  });

  const server = app.listen(config.port, () => {
    logger.info(
      { port: config.port },
      "Indexer HTTP server listening for /health and /metrics"
    );
  });

  return server;
}

module.exports = {
  createHttpServer,
};
