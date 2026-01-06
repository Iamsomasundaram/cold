// src/queue/types.ts
//
// Shared types for queue backends (in-memory, Kafka, etc.)

import { EventPayload } from "../types/EventPayload";

// Extra metadata we want to propagate along with the event
export interface QueueMeta {
  correlationId?: string; // from x-correlation-id
  tenantKey?: string; // from payload or x-tenant-key
}

// Simple stats interface, mainly used by /api/v1/metrics debug endpoint
export interface QueueStats {
  queued: number;
  processed: number;
  lastProcessedAt?: string;
}

// Interface all queue backends must implement
export interface EventQueue {
  // enqueue is async because Kafka send() returns a Promise
  enqueue(event: EventPayload, meta?: QueueMeta): Promise<void>;

  // Optional methods for in-memory queue; Kafka backend will usually no-op
  startConsumer?(): void;
  getStats?(): QueueStats;
}
