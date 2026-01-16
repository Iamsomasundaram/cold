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

    const payload = this.buildSlackPayload(message);

    const res = await fetch(this.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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

  private buildSlackPayload(message: NotificationMessage) {
    const parsed = this.parseFields(message.text);
    const blocks: Array<Record<string, any>> = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${message.severity} Alert`,
          emoji: false,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${message.title}*`,
        },
      },
    ];

    if (parsed.extras.length) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: parsed.extras.join("\n"),
        },
      });
    }

    if (parsed.fields.length) {
      for (const group of this.chunk(parsed.fields, 10)) {
        blocks.push({
          type: "section",
          fields: group,
        });
      }
    }

    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Source: notification-service",
        },
      ],
    });

    return {
      text: `${message.title}\n${message.text}`,
      blocks,
    };
  }

  private parseFields(text: string) {
    const fields: Array<Record<string, string>> = [];
    const extras: string[] = [];

    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;

      const idx = line.indexOf(":");
      if (idx > 0) {
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        fields.push({
          type: "mrkdwn",
          text: `*${this.escapeMrkdwn(key)}*\n${this.escapeMrkdwn(value)}`,
        });
      } else {
        extras.push(line);
      }
    }

    return { fields, extras };
  }

  private chunk<T>(items: T[], size: number) {
    const groups: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      groups.push(items.slice(i, i + size));
    }
    return groups;
  }

  private escapeMrkdwn(value: string) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
}
