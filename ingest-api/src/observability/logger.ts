// src/observability/logger.ts
//
// Central Pino logger configuration.
// - Writes JSON logs to stdout (good for K8s / log shipper).
// - In dev, you can wire pino-pretty via transport for readable logs.

import pino from "pino";

const isDev = (process.env.NODE_ENV || "dev") !== "production";

// Base options shared by all environments
const baseOptions: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL || "info",
  base: {
    service: "ingest-api", // every log line will have this
    env: process.env.NODE_ENV || "dev",
  },
  timestamp: pino.stdTimeFunctions.isoTime, // ISO-8601 timestamp
};

export const rootLogger = isDev
  ? pino({
      ...baseOptions,
      // In dev, pretty-print JSON logs for readability
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          singleLine: false,
        },
      },
    })
  : pino(baseOptions); // In prod, raw JSON for log shipper
