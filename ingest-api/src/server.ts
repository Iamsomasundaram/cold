// src/server.ts
//
// App entry-point.
// - Sets up Express.
// - Wires Pino HTTP logger.
// - Wires request context & metrics middleware.
// - Exposes /api/v1/events, /api/v1/metrics, /metrics.
// - Starts in-memory queue consumer.

import express, { Request, Response, NextFunction } from "express";
import pinoHttp from "pino-http";

import { rootLogger } from "./observability/logger";
import { requestContextMiddleware } from "./middleware/requestContext";
import { metricsRegistry, getPrometheusMetrics } from "./observability/metrics";
import ingestRouter from "./routes/ingestRoutes";
import metricsRouter from "./routes/metricsRoutes";
import { eventQueue, startQueueConsumerIfNeeded } from "./queue/eventQueue";
import { rateLimitMiddleware } from "./middleware/rateLimit";
import { apiKeyAuthMiddleware } from "./middleware/apiKeyAuth";

const app = express();
const PORT = Number(process.env.PORT) || 8080;

// JSON body parser with an explicit limit to guard against oversized payloads
app.use(express.json({ limit: "512kb" }));

// Pino HTTP logger:
// - attaches req.log
// - logs basic request info
app.use(
  pinoHttp({
    logger: rootLogger,
    // genReqId can be used, but we do correlationId in requestContextMiddleware.
    customProps: () => ({
      service: "ingest-api",
      env: process.env.NODE_ENV || "dev",
    }),
  })
);

// Our custom middleware:
// - sets correlationId and tenantKey
// - observes HTTP metrics
app.use(requestContextMiddleware);
// - simple in-process rate limiting (per IP)
// TODO: Define NFR targets and add rate-limit/load test cases per service.
// TODO: NFR checklist ideas:
// TODO: - Latency SLOs (p50/p95/p99) per endpoint and service.
// TODO: - Throughput targets (sustained EPS, burst EPS).
// TODO: - Error budgets (5xx/4xx thresholds, retry policies).
// TODO: - Backpressure behavior (Kafka lag, DB pool saturation).
// TODO: - Resilience tests (timeouts, dependency outages).
// TODO: - Security constraints (auth failures, rate-limit abuse).
app.use(rateLimitMiddleware);
// - optional API key guard (enabled only when INGEST_API_KEY is set)
app.use(apiKeyAuthMiddleware);

// Routes
// TODO: No protection against large bodies or abusive clients: express.json() uses defaults (100kb) and there’s no auth/rate limiting
app.use("/api/v1/events", ingestRouter);
app.use("/api/v1/metrics", metricsRouter);

// Prometheus scrape endpoint
app.get("/metrics", async (_req: Request, res: Response) => {
  try {
    const body = await getPrometheusMetrics();
    res.setHeader("Content-Type", metricsRegistry.contentType);
    res.send(body);
  } catch (err: any) {
    rootLogger.error({ err }, "metrics_endpoint_error");
    res.status(500).send("Error collecting metrics");
  }
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ message: "Not found" });
});

// Final error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  rootLogger.error(
    { error_name: err?.name, error_message: err?.message },
    "unhandled_error"
  );
  res.status(500).json({ message: "Internal server error" });
});

// Start in-memory queue consumer (simulated downstream)
// Start in-memory queue consumer (no-op for Kafka backend)
startQueueConsumerIfNeeded();

app.listen(PORT, () => {
  rootLogger.info({ port: PORT }, "ingest_api_listening");
});
