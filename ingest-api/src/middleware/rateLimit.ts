// src/middleware/rateLimit.ts
//
// Lightweight, in-memory rate limiter (per IP) to deter abusive clients.
// This is intentionally simple and suitable for dev/demo; in production you
// should use a distributed limiter (Redis/Envoy/ingress).

import { NextFunction, Request, Response } from "express";

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
// Default supports LP1/LP2/LP3 without throttling; override for stress tests.
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS || 6000);

type Counter = { count: number; expiresAt: number };
const counters = new Map<string, Counter>();

function now() {
  return Date.now();
}

export function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  const current = counters.get(ip);
  const ts = now();

  if (!current || current.expiresAt <= ts) {
    counters.set(ip, { count: 1, expiresAt: ts + WINDOW_MS });
    return next();
  }

  current.count += 1;

  if (current.count > MAX_REQUESTS) {
    const retryAfterSec = Math.ceil((current.expiresAt - ts) / 1000);
    res.setHeader("Retry-After", String(retryAfterSec));
    return res
      .status(429)
      .json({ message: "Too many requests, please slow down" });
  }

  next();
}

// Periodic cleanup to avoid unbounded map growth
setInterval(() => {
  const ts = now();
  for (const [ip, counter] of counters.entries()) {
    if (counter.expiresAt <= ts) {
      counters.delete(ip);
    }
  }
}, WINDOW_MS).unref();
