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

function normalizeWhatsappNumber(value: string): string {
  if (!value) return value;
  return value.startsWith("whatsapp:") ? value : `whatsapp:${value}`;
}

@Injectable()
export class TwilioSmsNotifier implements NotificationChannel {
  readonly name = "sms";
  private readonly logger = new Logger(TwilioSmsNotifier.name);
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly fromNumber: string;
  private readonly toNumbers: string[];

  constructor(private readonly config: ConfigService) {
    this.accountSid = String(
      this.config.get("TWILIO_ACCOUNT_SID", "")
    ).trim();
    this.authToken = String(this.config.get("TWILIO_AUTH_TOKEN", "")).trim();
    this.fromNumber = String(this.config.get("TWILIO_SMS_FROM", "")).trim();
    this.toNumbers = parseCsv(
      String(this.config.get("TWILIO_SMS_TO", ""))
    );
  }

  isEnabled(): boolean {
    return Boolean(
      this.accountSid &&
        this.authToken &&
        this.fromNumber &&
        this.toNumbers.length
    );
  }

  async send(message: NotificationMessage): Promise<NotificationSendResult> {
    if (!this.isEnabled()) {
      this.logger.warn("Twilio SMS not configured; skipping send.");
      return { channel: this.name, status: "skipped", reason: "not_configured" };
    }

    const auth = Buffer.from(
      `${this.accountSid}:${this.authToken}`
    ).toString("base64");

    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    for (const to of this.toNumbers) {
      const body = new URLSearchParams({
        From: this.fromNumber,
        To: to,
        Body: `${message.title}\n${message.text}`,
      });

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });

      if (!res.ok) {
        const text = await res.text();
        this.logger.error(`Twilio SMS failed: ${res.status} ${text}`);
        return {
          channel: this.name,
          status: "failed",
          reason: `http_${res.status}`,
        };
      }
    }

    return { channel: this.name, status: "sent" };
  }
}

@Injectable()
export class TwilioWhatsappNotifier implements NotificationChannel {
  readonly name = "whatsapp";
  private readonly logger = new Logger(TwilioWhatsappNotifier.name);
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly fromNumber: string;
  private readonly toNumbers: string[];

  constructor(private readonly config: ConfigService) {
    this.accountSid = String(
      this.config.get("TWILIO_ACCOUNT_SID", "")
    ).trim();
    this.authToken = String(this.config.get("TWILIO_AUTH_TOKEN", "")).trim();
    this.fromNumber = normalizeWhatsappNumber(
      String(this.config.get("TWILIO_WHATSAPP_FROM", "")).trim()
    );
    this.toNumbers = parseCsv(
      String(this.config.get("TWILIO_WHATSAPP_TO", ""))
    ).map(normalizeWhatsappNumber);
  }

  isEnabled(): boolean {
    return Boolean(
      this.accountSid &&
        this.authToken &&
        this.fromNumber &&
        this.toNumbers.length
    );
  }

  async send(message: NotificationMessage): Promise<NotificationSendResult> {
    if (!this.isEnabled()) {
      this.logger.warn("Twilio WhatsApp not configured; skipping send.");
      return { channel: this.name, status: "skipped", reason: "not_configured" };
    }

    const auth = Buffer.from(
      `${this.accountSid}:${this.authToken}`
    ).toString("base64");

    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    for (const to of this.toNumbers) {
      const body = new URLSearchParams({
        From: this.fromNumber,
        To: to,
        Body: `${message.title}\n${message.text}`,
      });

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });

      if (!res.ok) {
        const text = await res.text();
        this.logger.error(`Twilio WhatsApp failed: ${res.status} ${text}`);
        return {
          channel: this.name,
          status: "failed",
          reason: `http_${res.status}`,
        };
      }
    }

    return { channel: this.name, status: "sent" };
  }
}
