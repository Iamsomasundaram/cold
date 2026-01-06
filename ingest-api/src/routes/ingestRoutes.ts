// src/routes/ingestRoutes.ts
//
// HTTP layer for POST /api/v1/events
// - Parses the body as EventPayload.
// - Calls processEvent().
// - Maps ValidationError -> 400 and others -> 500.
// - Uses req.log (from pino-http) for request-scoped logs.

import { Router, Request, Response } from "express";
import { EventPayload } from "../types/EventPayload";
import { processEvent } from "../services/ingestService";
import { ValidationError } from "../errors/ValidationError";
import { QueueFullError } from "../errors/QueueFullError";

const router = Router();
router.post("/", async (req: Request, res: Response) => {
  const payload = req.body as EventPayload;
  const log = (req as any).log || console;
  const correlationId = payload.correlation_id || req.correlationId;
  const tenantKey = payload.tenant_key || req.tenantKey;

  try {
    await processEvent(payload, {
      correlationId,
      tenantKey,
    });

    log.info(
      {
        event_id: payload.event_id,
        tenant_key: payload.tenant_key,
        sensor_code: payload.sensor_code,
        metric: payload.metric,
        scenario: payload.scenario,
        data_profile: payload.data_profile,
        correlation_id: correlationId,
      },
      "ingest_request_accepted"
    );

    return res.status(202).json({ message: "Event accepted" });
  } catch (err: any) {
    if (err instanceof ValidationError) {
      log.warn(
        {
          event_id: payload.event_id,
          tenant_key: payload.tenant_key,
          sensor_code: payload.sensor_code,
          metric: payload.metric,
          scenario: payload.scenario,
          data_profile: payload.data_profile,
          correlation_id: correlationId,
          validation_reason: err.message,
        },
        "ingest_request_validation_failed"
      );
      return res.status(400).json({ message: err.message });
    }

    if (err instanceof QueueFullError) {
      log.warn(
        {
          event_id: payload?.event_id,
          tenant_key: payload?.tenant_key,
          sensor_code: payload?.sensor_code,
          metric: payload?.metric,
          scenario: payload?.scenario,
          data_profile: payload?.data_profile,
          correlation_id: correlationId,
        },
        "ingest_request_queue_full"
      );
      return res.status(429).json({ message: "Queue is busy, retry later" });
    }

    log.error(
      {
        event_id: payload?.event_id,
        tenant_key: payload?.tenant_key,
        sensor_code: payload?.sensor_code,
        metric: payload?.metric,
        scenario: payload?.scenario,
        data_profile: payload?.data_profile,
        correlation_id: correlationId,
        error_name: err?.name,
        error_message: err?.message,
      },
      "ingest_request_internal_error"
    );

    return res.status(500).json({ message: "Internal server error" });
  }
});

/*
router.post("/", async (req: Request, res: Response) => {
  const payload = req.body as EventPayload;
  const correlationId = payload.correlation_id || req.correlationId;

  // req.log comes from pino-http; we used requestContext middleware
  const log = (req as any).log || console;

  try {
    await processEvent(payload);

    log.info(
      {
        event_id: payload.event_id,
        tenant_key: payload.tenant_key,
        sensor_code: payload.sensor_code,
        metric: payload.metric,
        scenario: payload.scenario,
        data_profile: payload.data_profile,
        correlation_id: correlationId,
      },
      "ingest_request_accepted"
    );

    // 202 → accepted for async processing
    return res.status(202).json({ message: "Event accepted" });
  } catch (err: any) {
    if (err instanceof ValidationError) {
      log.warn(
        {
          event_id: payload.event_id,
          tenant_key: payload.tenant_key,
          sensor_code: payload.sensor_code,
          metric: payload.metric,
          scenario: payload.scenario,
          data_profile: payload.data_profile,
          correlation_id: correlationId,
          validation_reason: err.message,
        },
        "ingest_request_validation_failed"
      );
      return res.status(400).json({ message: err.message });
    }

    log.error(
      {
        event_id: payload?.event_id,
        tenant_key: payload?.tenant_key,
        sensor_code: payload?.sensor_code,
        metric: payload?.metric,
        scenario: payload?.scenario,
        data_profile: payload?.data_profile,
        correlation_id: correlationId,
        error_name: err?.name,
        error_message: err?.message,
      },
      "ingest_request_internal_error"
    );

    return res.status(500).json({ message: "Internal server error" });
  }
});
*/
export default router;
