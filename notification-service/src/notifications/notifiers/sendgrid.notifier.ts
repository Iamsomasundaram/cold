import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  NotificationChannel,
  NotificationMessage,
  NotificationSendResult,
} from "../notification.types";

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

@Injectable()
export class SendGridNotifier implements NotificationChannel {
  readonly name = "email";
  private readonly logger = new Logger(SendGridNotifier.name);
  private readonly apiKey: string;
  private readonly fromEmail: string;
  private readonly toEmails: string[];

  constructor(private readonly config: ConfigService) {
    this.apiKey = String(this.config.get("SENDGRID_API_KEY", "")).trim();
    this.fromEmail = String(
      this.config.get("SENDGRID_FROM_EMAIL", "")
    ).trim();
    this.toEmails = parseCsv(
      String(this.config.get("SENDGRID_TO_EMAILS", ""))
    );
  }

  isEnabled(): boolean {
    return Boolean(this.apiKey && this.fromEmail && this.toEmails.length);
  }

  async send(message: NotificationMessage): Promise<NotificationSendResult> {
    if (!this.isEnabled()) {
      this.logger.warn("SendGrid not configured; skipping send.");
      return { channel: this.name, status: "skipped", reason: "not_configured" };
    }

    const body = {
      personalizations: [
        {
          to: this.toEmails.map((email) => ({ email })),
          subject: message.title,
        },
      ],
      from: { email: this.fromEmail },
      content: [{ type: "text/plain", value: message.text }],
    };

    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`SendGrid send failed: ${res.status} ${text}`);
      return {
        channel: this.name,
        status: "failed",
        reason: `http_${res.status}`,
      };
    }

    return { channel: this.name, status: "sent" };
  }
}
