// src/logger.js
const pino = require("pino");
const { config } = require("./config");

// Pretty-print logs in development for easier reading.
const isDev = config.env === "development";

const logger = pino({
  name: config.serviceName,
  level: process.env.LOG_LEVEL || "info",
  transport: isDev
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }
    : undefined,
});

module.exports = { logger };
