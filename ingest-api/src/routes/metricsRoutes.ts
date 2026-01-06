// src/routes/metricsRoutes.ts
//
// Dev-friendly metrics endpoint, separate from Prometheus /metrics.
// - Returns JSON snapshot of all metrics and queue stats.
// - Useful when playing locally with k6 to see "what the service thinks".

import { Router, Request, Response } from "express";
import { getMetricsDebugSnapshot } from "../observability/metrics";
import { getQueueStats } from "../queue/eventQueue";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  const snapshot = await getMetricsDebugSnapshot();
  const queueStats = getQueueStats();

  return res.json({
    metrics: snapshot.metrics,
    queue: queueStats,
  });
});

export default router;
