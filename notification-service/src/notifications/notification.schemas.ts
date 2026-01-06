import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

@Schema({ timestamps: true })
export class NotificationRule extends Document {
  @Prop({ required: true })
  tenant_key!: string;

  @Prop()
  sensor_code?: string;

  @Prop()
  severity?: string;

  @Prop({ type: [String], default: ["slack", "email", "sms", "whatsapp"] })
  channels!: string[];

  @Prop({ default: 300 })
  throttle_window_seconds!: number;

  @Prop({ default: true })
  enabled!: boolean;
}

export const NotificationRuleSchema =
  SchemaFactory.createForClass(NotificationRule);
NotificationRuleSchema.index({ tenant_key: 1, sensor_code: 1, severity: 1 });

@Schema({ timestamps: true })
export class NotificationThrottle extends Document {
  @Prop({ required: true, unique: true })
  key!: string;

  @Prop({ required: true })
  tenant_key!: string;

  @Prop({ required: true })
  sensor_code!: string;

  @Prop({ required: true })
  severity!: string;

  @Prop({ required: true })
  window_seconds!: number;

  @Prop({ required: true })
  first_event_at!: Date;

  @Prop({ required: true })
  last_event_at!: Date;

  @Prop({ required: true })
  last_sent_at!: Date;

  @Prop({ default: 0 })
  suppressed_count!: number;

  @Prop({ required: true })
  expires_at!: Date;
}

export const NotificationThrottleSchema =
  SchemaFactory.createForClass(NotificationThrottle);
NotificationThrottleSchema.index({ key: 1 }, { unique: true });
NotificationThrottleSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

@Schema({ timestamps: true })
export class NotificationDelivery extends Document {
  @Prop({ required: true })
  tenant_key!: string;

  @Prop({ required: true })
  sensor_code!: string;

  @Prop({ required: true })
  severity!: string;

  @Prop()
  violation_type?: string;

  @Prop()
  event_id?: string;

  @Prop()
  reading_id?: string;

  @Prop()
  violation_id?: string;

  @Prop({ required: true })
  channel!: string;

  @Prop({ required: true })
  status!: string;

  @Prop()
  reason?: string;

  @Prop({ required: true })
  detected_at!: Date;

  @Prop()
  correlation_id?: string;

  @Prop()
  trace_id?: string;

  @Prop({ type: Object })
  tags?: Record<string, unknown>;
}

export const NotificationDeliverySchema =
  SchemaFactory.createForClass(NotificationDelivery);
NotificationDeliverySchema.index({ tenant_key: 1, detected_at: -1 });
