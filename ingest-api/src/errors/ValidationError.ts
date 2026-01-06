// src/errors/ValidationError.ts
//
// Explicit error type for validation failures.
// Used to distinguish between 4xx and 5xx in the route.

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
