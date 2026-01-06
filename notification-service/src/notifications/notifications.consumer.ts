import { Controller, Logger } from "@nestjs/common";
import { Ctx, EventPattern, KafkaContext, Payload } from "@nestjs/microservices";
import { NotificationsService } from "./notifications.service";

const DETECTED_TOPIC = process.env.DETECTED_TOPIC || "events.detected.v1";

@Controller()
export class NotificationEventsController {
  private readonly logger = new Logger(NotificationEventsController.name);

  constructor(private readonly notifications: NotificationsService) {}

  @EventPattern(DETECTED_TOPIC)
  async handleDetectedEvent(
    @Payload() payload: any,
    @Ctx() context: KafkaContext
  ) {
    const message = context.getMessage();
    const rawValue = message?.value;
    const decoded = this.decodePayload(payload, rawValue);

    if (!decoded) {
      this.logger.warn("Detected event payload is empty or invalid JSON.");
      return;
    }

    await this.notifications.handleDetectedEvent(decoded);
  }

  private decodePayload(payload: any, rawValue: any) {
    if (payload && typeof payload === "object" && !Buffer.isBuffer(payload)) {
      return payload;
    }

    if (Buffer.isBuffer(rawValue)) {
      try {
        return JSON.parse(rawValue.toString("utf8"));
      } catch (err) {
        this.logger.warn({ err }, "Failed to parse Kafka buffer payload.");
        return null;
      }
    }

    if (typeof payload === "string") {
      try {
        return JSON.parse(payload);
      } catch (err) {
        this.logger.warn({ err }, "Failed to parse string payload.");
        return null;
      }
    }

    return null;
  }
}
