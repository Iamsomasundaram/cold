// src/queue/inMemoryEventQueue.ts
//
// In-memory queue backend.
// - Good for local dev and for understanding the flow.
// - startConsumer() processes events in the same process.
// - Not used in real production once Kafka is in place.

import { EventPayload } from "../types/EventPayload";
import { rootLogger } from "../observability/logger";
import { setQueueDepth } from "../observability/metrics";
import { EventQueue, QueueMeta, QueueStats } from "./types";
import { QueueFullError } from "../errors/QueueFullError";

interface QueueItem {
  event: EventPayload;
  enqueuedAt: number;
}

export const QUEUE_NAME = "events-ingest";
const DEFAULT_MAX_DEPTH = 10000;
const MAX_DEPTH = Number(process.env.QUEUE_MEMORY_MAX_DEPTH || DEFAULT_MAX_DEPTH);

class InMemoryEventQueue implements EventQueue {
  private queue: QueueItem[] = [];
  private processedCount = 0;
  private lastProcessedAt?: number;

  // TODO: Enforce caps/drop/429 when full - Implement rate-limiting
  async enqueue(event: EventPayload, meta?: QueueMeta): Promise<void> {
    if (!Number.isFinite(MAX_DEPTH) || MAX_DEPTH <= 0) {
      throw new QueueFullError("In-memory queue max depth is misconfigured");
    }

    if (this.queue.length >= MAX_DEPTH) {
      throw new QueueFullError(
        `In-memory queue is full (depth=${this.queue.length}, max=${MAX_DEPTH})`
      );
    }

    this.queue.push({ event, enqueuedAt: Date.now() });

    // Update queue depth metric
    setQueueDepth(QUEUE_NAME, this.queue.length);

    rootLogger.debug(
      {
        event_id: event.event_id,
        tenant_key: event.tenant_key,
        sensor_code: event.sensor_code,
        metric: event.metric,
        scenario: event.scenario,
        data_profile: event.data_profile,
        queue_depth: this.queue.length,
        correlation_id: meta?.correlationId,
      },
      "queue_enqueued_memory"
    );
  }

  // Background consumer just to simulate downstream processing
  startConsumer(intervalMs = 1000, batchSize = 100) {
    setInterval(() => {
      let processedInBatch = 0;

      while (processedInBatch < batchSize && this.queue.length > 0) {
        const item = this.queue.shift()!;
        this.handleItem(item);
        processedInBatch += 1;
      }

      setQueueDepth(QUEUE_NAME, this.queue.length);
    }, intervalMs);
  }

  private handleItem(item: QueueItem) {
    this.processedCount += 1;
    this.lastProcessedAt = Date.now();

    const delayMs = this.lastProcessedAt - item.enqueuedAt;

    rootLogger.info(
      {
        event_id: item.event.event_id,
        tenant_key: item.event.tenant_key,
        sensor_code: item.event.sensor_code,
        metric: item.event.metric,
        scenario: item.event.scenario,
        data_profile: item.event.data_profile,
        queue_delay_ms: delayMs,
        processed_count: this.processedCount,
        queue_name: QUEUE_NAME,
      },
      "queue_processed_memory"
    );

    // 🔜 Later: call detector / indexer / GenAI here for in-memory mode.
  }

  getStats(): QueueStats {
    return {
      queued: this.queue.length,
      processed: this.processedCount,
      lastProcessedAt: this.lastProcessedAt
        ? new Date(this.lastProcessedAt).toISOString()
        : undefined,
    };
  }
}

export const inMemoryEventQueue = new InMemoryEventQueue();
