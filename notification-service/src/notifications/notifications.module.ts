import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import {
  NotificationDelivery,
  NotificationDeliverySchema,
  NotificationRule,
  NotificationRuleSchema,
  NotificationThrottle,
  NotificationThrottleSchema,
} from "./notification.schemas";
import { NotificationsService } from "./notifications.service";
import { NotificationEventsController } from "./notifications.consumer";
import {
  NotificationDeliveriesController,
  NotificationRulesController,
} from "./notifications.controller";
import { NotificationsProducer } from "./notifications.producer";
import { NotificationSeedService } from "./notifications.seed";
import {
  SlackNotifier,
  SendGridNotifier,
  TwilioSmsNotifier,
  TwilioWhatsappNotifier,
} from "./notifiers";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: NotificationRule.name, schema: NotificationRuleSchema },
      { name: NotificationThrottle.name, schema: NotificationThrottleSchema },
      { name: NotificationDelivery.name, schema: NotificationDeliverySchema },
    ]),
  ],
  controllers: [
    NotificationEventsController,
    NotificationRulesController,
    NotificationDeliveriesController,
  ],
  providers: [
    NotificationsService,
    NotificationsProducer,
    NotificationSeedService,
    SlackNotifier,
    SendGridNotifier,
    TwilioSmsNotifier,
    TwilioWhatsappNotifier,
  ],
})
export class NotificationsModule {}
