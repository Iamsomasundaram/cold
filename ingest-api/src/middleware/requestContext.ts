// src/middleware/requestContext.ts
//
// Middleware to:
// - Ensure we have a correlation ID for each request.
// - Attach helpful fields to req for downstream usage.
// - Measure HTTP latencies and feed Prometheus metrics.
//
// NOTE: pino-http already adds `req.log` for per-request logging.

import { NextFunction, Request, Response } from "express";
import { observeHttpRequest } from "../observability/metrics";

// Helper to generate a simple correlation ID (you can replace with UUID)
function generateCorrelationId(): string {
  return `corr-${Math.random().toString(16).slice(2)}-${Date.now()}`;
}

// Extend Express Request type to carry correlationId & tenantKey
declare module "express-serve-static-core" {
  interface Request {
    correlationId?: string;
    tenantKey?: string;
  }
}

// This middleware:
// - reads x-correlation-id (or generates one)
// - reads x-tenant-id if present
// - measures HTTP duration and records metrics
export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const start = process.hrtime.bigint(); // high-resolution timer

  // Pick correlation ID from header or generate one
  const headerCorrId = req.header("x-correlation-id");
  const correlationId = headerCorrId || generateCorrelationId();
  req.correlationId = correlationId;

  // Tenant key is optional and can come from header
  const tenantKey =
    req.header("x-tenant-key") || req.header("x-tenant-id") || "default";
  req.tenantKey = tenantKey;

  // Attach correlationId / tenantKey to the pino logger for this request
  // pino-http mounts a logger on req.log; it’s safe to call child() here.
  if ((req as any).log && typeof (req as any).log.child === "function") {
    (req as any).log = (req as any).log.child({
      correlation_id: correlationId,
      tenant_key: tenantKey,
    });
  }

  // When response finishes, record timing metrics
  res.on("finish", () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000; // ns → ms

    const method = req.method;
    // A normalized path is nicer for cardinality (avoid IDs in path)
    const path = req.route?.path || req.path || "unknown";
    const statusCode = res.statusCode;

    observeHttpRequest(method, path, statusCode, durationMs);

    // Optional: you can log one-line request summary here at debug/info level
    // ; (req as any).log?.info(
    //   { duration_ms: durationMs, statusCode },
    //   'request_completed',
    // );
  });

  next();
}
