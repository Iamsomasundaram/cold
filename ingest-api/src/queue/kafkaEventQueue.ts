// src/queue/kafkaEventQueue.ts
//
// Kafka-based queue backend using kafkajs.
// - Produces events to a Kafka topic (default: events.ingest.v1).
// - No local consumer in this service; downstream microservices will consume.
//
// Env vars:
//   QUEUE_BACKEND=kafka
//   KAFKA_BROKERS=localhost:9092
//   KAFKA_CLIENT_ID=ingest-api
//   KAFKA_TOPIC_EVENTS=events.ingest.v1

import { Kafka, logLevel } from "kafkajs";
import { EventPayload } from "../types/EventPayload";
import { rootLogger } from "../observability/logger";
import { EventQueue, QueueMeta, QueueStats } from "./types";

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || "localhost:9092").split(
  ","
);
const KAFKA_CLIENT_ID = process.env.KAFKA_CLIENT_ID || "ingest-api";
const KAFKA_TOPIC_EVENTS = process.env.KAFKA_TOPIC_EVENTS || "events.ingest.v1";

const kafka = new Kafka({
  clientId: KAFKA_CLIENT_ID,
  brokers: KAFKA_BROKERS,
  logLevel: logLevel.NOTHING, // we use our own logger
});

const producer = kafka.producer();

// Connect lazily on first use, and reuse the same connection
let connectPromise: Promise<void> | null = null;

async function ensureProducerConnected() {
  if (!connectPromise) {
    connectPromise = producer
      .connect()
      .then(() => {
        rootLogger.info(
          { brokers: KAFKA_BROKERS, topic: KAFKA_TOPIC_EVENTS },
          "kafka_producer_connected"
        );
      })
      .catch((err) => {
        connectPromise = null;
        rootLogger.error({ err }, "kafka_producer_connect_error");
        throw err;
      });
  }
  return connectPromise;
}

class KafkaEventQueue implements EventQueue {
  async enqueue(event: EventPayload, meta?: QueueMeta): Promise<void> {
    await ensureProducerConnected();

    // Key by tenant + sensor to preserve order per sensor stream
    const key = `${event.tenant_key}:${event.sensor_code}`;

    // Kafka headers carry observability context and metadata
    const headers: Record<string, string> = {
      "x-tenant-key": event.tenant_key,
      "x-sensor-code": event.sensor_code,
      "x-metric": event.metric,
      "x-scenario": event.scenario,
      "x-data-profile": event.data_profile,
      "x-schema-version": "cold-storage-v1",
      "x-ingest-timestamp": new Date().toISOString(),
    };

    const correlationId = meta?.correlationId || event.correlation_id;
    if (correlationId) {
      headers["x-correlation-id"] = correlationId;
    }

    try {
      await producer.send({
        topic: KAFKA_TOPIC_EVENTS,
        messages: [
          {
            key,
            value: JSON.stringify(event),
            headers,
          },
        ],
      });

      rootLogger.info(
        {
          event_id: event.event_id,
          tenant_key: event.tenant_key,
          sensor_code: event.sensor_code,
          metric: event.metric,
          scenario: event.scenario,
          data_profile: event.data_profile,
          correlation_id: correlationId,
          topic: KAFKA_TOPIC_EVENTS,
        },
        "kafka_event_produced"
      );
    } catch (err) {
      rootLogger.error(
        {
          err,
          event_id: event.event_id,
          tenant_key: event.tenant_key,
          sensor_code: event.sensor_code,
          metric: event.metric,
          scenario: event.scenario,
          data_profile: event.data_profile,
          correlation_id: correlationId,
          topic: KAFKA_TOPIC_EVENTS,
        },
        "kafka_producer_send_error"
      );
      // Let the caller decide how to handle (e.g., respond 500)
      throw err;
    }
  }

  // For compatibility with QueueStats; producer itself doesn't track depth.
  getStats(): QueueStats {
    return {
      queued: 0,
      processed: 0,
      lastProcessedAt: undefined,
    };
  }
}

export const kafkaEventQueue = new KafkaEventQueue();
