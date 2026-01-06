import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { NotificationRule } from "./notification.schemas";

const DEFAULT_CHANNELS = ["slack", "email", "sms", "whatsapp"];

@Injectable()
export class NotificationSeedService implements OnModuleInit {
  private readonly logger = new Logger(NotificationSeedService.name);
  private readonly defaultWindowSeconds: number;

  constructor(
    @InjectModel(NotificationRule.name)
    private readonly ruleModel: Model<NotificationRule>,
    private readonly config: ConfigService
  ) {
    this.defaultWindowSeconds = Number(
      this.config.get("NOTIFICATION_DEFAULT_WINDOW_SECONDS", 300)
    );
  }

  async onModuleInit() {
    await this.seedDefaults();
  }

  private async seedDefaults() {
    const defaults = [
      {
        tenant_key: "potato_wh",
        sensor_code: null,
        severity: null,
        channels: DEFAULT_CHANNELS,
        throttle_window_seconds: this.defaultWindowSeconds,
        enabled: true,
      },
      {
        tenant_key: "healthcare_fac",
        sensor_code: null,
        severity: null,
        channels: DEFAULT_CHANNELS,
        throttle_window_seconds: this.defaultWindowSeconds,
        enabled: true,
      },
      {
        tenant_key: "*",
        sensor_code: null,
        severity: null,
        channels: DEFAULT_CHANNELS,
        throttle_window_seconds: this.defaultWindowSeconds,
        enabled: true,
      },
    ];

    for (const rule of defaults) {
      await this.ruleModel.updateOne(
        {
          tenant_key: rule.tenant_key,
          sensor_code: rule.sensor_code,
          severity: rule.severity,
        },
        { $setOnInsert: rule },
        { upsert: true }
      );
    }

    this.logger.log("Seeded default notification rules (if missing).");
  }
}
