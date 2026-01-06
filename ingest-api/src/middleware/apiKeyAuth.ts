// src/middleware/apiKeyAuth.ts
//
// Optional API key guard. When INGEST_API_KEY is set, incoming requests must
// provide the same value in the X-API-Key header. If the env var is empty,
// the middleware is a no-op.

import { NextFunction, Request, Response } from "express";

const REQUIRED_API_KEY = process.env.INGEST_API_KEY;

export function apiKeyAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!REQUIRED_API_KEY) {
    return next(); // disabled by default for local/dev
  }

  const provided = req.header("x-api-key");

  if (provided === REQUIRED_API_KEY) {
    return next();
  }

  return res.status(401).json({ message: "Unauthorized" });
}
