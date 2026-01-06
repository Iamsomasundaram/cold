import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  NotificationChannel,
  NotificationMessage,
  NotificationSendResult,
} from "../notification.types";

@Injectable()
export class SlackNotifier implements NotificationChannel {
  readonly name = "slack";
  private readonly logger = new Logger(SlackNotifier.name);
  private readonly webhookUrl: string;

  constructor(private readonly config: ConfigService) {
    // TODO: Remove hardcoded Slack webhook from compose after testing.
    this.webhookUrl = String(this.config.get("SLACK_WEBHOOK_URL", "")).trim();
  }

  isEnabled(): boolean {
    return Boolean(this.webhookUrl);
  }

  async send(message: NotificationMessage): Promise<NotificationSendResult> {
    if (!this.isEnabled()) {
      this.logger.warn("Slack webhook not configured; skipping send.");
      return { channel: this.name, status: "skipped", reason: "not_configured" };
    }

    const body = { text: `${message.title}\n${message.text}` };

    const res = await fetch(this.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Slack send failed: ${res.status} ${text}`);
      return {
        channel: this.name,
        status: "failed",
        reason: `http_${res.status}`,
      };
    }

    return { channel: this.name, status: "sent" };
  }
}
