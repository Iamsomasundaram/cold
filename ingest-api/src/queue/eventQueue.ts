// src/queue/eventQueue.ts
//
// Queue facade that selects the backend (in-memory or Kafka) based on env.
// - QUEUE_BACKEND=memory
// - QUEUE_BACKEND=kafka (default)
//
// Your business code should import from here, not from specific backend files.

import { EventQueue, QueueStats } from "./types";
import { inMemoryEventQueue } from "./inMemoryEventQueue";
import { kafkaEventQueue } from "./kafkaEventQueue";
import { rootLogger } from "../observability/logger";

const backend = (process.env.QUEUE_BACKEND || "kafka").toLowerCase();

let eventQueue: EventQueue;

if (backend === "kafka") {
  eventQueue = kafkaEventQueue;
  rootLogger.info({ backend }, "queue_backend_selected");
} else {
  eventQueue = inMemoryEventQueue;
  rootLogger.info({ backend }, "queue_backend_selected");
}

// Start consumer only for in-memory backend
export function startQueueConsumerIfNeeded() {
  if (
    backend === "memory" &&
    typeof inMemoryEventQueue.startConsumer === "function"
  ) {
    inMemoryEventQueue.startConsumer();
  } else {
    rootLogger.info({ backend }, "queue_consumer_not_started_for_backend");
  }
}

// Unified way to fetch queue stats (for debug /api/v1/metrics)
export function getQueueStats(): QueueStats {
  if (
    backend === "memory" &&
    typeof inMemoryEventQueue.getStats === "function"
  ) {
    return inMemoryEventQueue.getStats();
  }

  if (typeof (eventQueue as any).getStats === "function") {
    return (eventQueue as any).getStats();
  }

  return {
    queued: 0,
    processed: 0,
    lastProcessedAt: undefined,
  };
}

export { eventQueue };
