import { BadGatewayException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GenaiRequest, GenaiResponse } from "./genai.types";

const DEFAULT_TIMEOUT_MS = 30000;

@Injectable()
export class GenaiService {
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    const base = this.config.get("GENAI_URL", "http://localhost:4100");
    this.endpoint = base.endsWith("/genai/insights")
      ? base
      : `${base.replace(/\/$/, "")}/genai/insights`;
    this.timeoutMs = Number(
      this.config.get("GENAI_TIMEOUT_MS", DEFAULT_TIMEOUT_MS)
    );
  }

  async requestInsights(payload: GenaiRequest): Promise<GenaiResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const text = await response.text();
      if (!response.ok) {
        throw new BadGatewayException(
          text ? `GenAI error: ${text}` : "GenAI request failed"
        );
      }

      return text
        ? (JSON.parse(text) as GenaiResponse)
        : { answer: "", context: {} };
    } catch (err: any) {
      if (err?.name === "AbortError") {
        throw new BadGatewayException("GenAI request timed out");
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}
