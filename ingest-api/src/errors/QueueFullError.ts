// src/errors/QueueFullError.ts
//
// Explicit error type for signaling queue backpressure in the in-memory backend.

export class QueueFullError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueueFullError";
  }
}
