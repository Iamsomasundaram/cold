// src/services/metricsService.ts
import { EventPayload } from "../types/EventPayload";

interface SourceMetrics {
  received: number;
  accepted: number;
  rejected: number;
}

export interface MetricsSnapshot {
  totalReceived: number;
  totalAccepted: number;
  totalRejected: number;
  eventsPerSecond: number;
  windowSeconds: number;
  perSource: Record<string, SourceMetrics>;
}

class MetricsService {
  private totalReceived = 0;
  private totalAccepted = 0;
  private totalRejected = 0;
  private perSource: Map<string, SourceMetrics> = new Map();
  private eventTimestamps: number[] = []; // timestamps (ms) of received events

  private touchSource(source: string): SourceMetrics {
    let entry = this.perSource.get(source);
    if (!entry) {
      entry = { received: 0, accepted: 0, rejected: 0 };
      this.perSource.set(source, entry);
    }
    return entry;
  }

  recordReceived(source: string) {
    this.totalReceived += 1;
    this.touchSource(source).received += 1;
    this.eventTimestamps.push(Date.now());
  }

  recordAccepted(source: string) {
    this.totalAccepted += 1;
    this.touchSource(source).accepted += 1;
  }

  recordRejected(source: string) {
    this.totalRejected += 1;
    this.touchSource(source).rejected += 1;
  }

  // windowMs: rolling window for EPS calculation (default 60s)
  getSnapshot(windowMs = 60_000): MetricsSnapshot {
    const now = Date.now();
    const cutoff = now - windowMs;

    // prune old timestamps so memory doesn't grow forever
    this.eventTimestamps = this.eventTimestamps.filter((ts) => ts >= cutoff);

    const eps = this.eventTimestamps.length / (windowMs / 1000);

    const perSourceObj: Record<string, SourceMetrics> = {};
    for (const [source, stats] of this.perSource.entries()) {
      perSourceObj[source] = { ...stats };
    }

    return {
      totalReceived: this.totalReceived,
      totalAccepted: this.totalAccepted,
      totalRejected: this.totalRejected,
      eventsPerSecond: Number(eps.toFixed(2)),
      windowSeconds: windowMs / 1000,
      perSource: perSourceObj,
    };
  }
}

export const metricsService = new MetricsService();
