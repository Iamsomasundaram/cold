// src/logger.js
const pino = require("pino");
const { config } = require("./config");

const logger = pino({
  name: config.serviceName,
  level: process.env.LOG_LEVEL || "info",
  transport:
    config.env === "development"
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
