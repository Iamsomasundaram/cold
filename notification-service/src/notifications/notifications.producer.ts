import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Kafka, Producer } from "kafkajs";

@Injectable()
export class NotificationsProducer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsProducer.name);
  private readonly topic: string;
  private readonly brokers: string[];
  private readonly clientId: string;
  private producer: Producer | null = null;

  constructor(private readonly config: ConfigService) {
    this.topic = String(
      this.config.get("NOTIFICATIONS_TOPIC", "events.notifications.v1")
    );
    this.brokers = String(this.config.get("KAFKA_BROKERS", "localhost:9092"))
      .split(",")
      .map((b) => b.trim())
      .filter(Boolean);
    const baseClientId = String(
      this.config.get("KAFKA_CLIENT_ID", "notification")
    );
    this.clientId = `${baseClientId}-producer`;
  }

  async onModuleInit() {
    try {
      const kafka = new Kafka({
        clientId: this.clientId,
        brokers: this.brokers,
      });
      await this.ensureTopic(kafka);
      this.producer = kafka.producer();
      await this.producer.connect();
      this.logger.log(`Kafka producer connected (topic=${this.topic}).`);
    } catch (err) {
      this.logger.error({ err }, "Failed to connect Kafka producer.");
      this.producer = null;
    }
  }

  async onModuleDestroy() {
    if (this.producer) {
      await this.producer.disconnect();
      this.producer = null;
    }
  }

  async emit(payload: Record<string, unknown>, key?: string) {
    if (!this.producer) {
      this.logger.warn("Kafka producer not initialized; skipping emit.");
      return;
    }

    const value = Buffer.from(JSON.stringify(payload));
    await this.producer.send({
      topic: this.topic,
      messages: [{ key: key || null, value }],
    });
  }

  private async ensureTopic(kafka: Kafka) {
    const admin = kafka.admin();
    try {
      await admin.connect();
      const created = await admin.createTopics({
        topics: [
          {
            topic: this.topic,
            numPartitions: 1,
            replicationFactor: 1,
          },
        ],
        waitForLeaders: true,
      });
      if (created) {
        this.logger.log(`Kafka topic created: ${this.topic}`);
      }
    } catch (err) {
      this.logger.warn({ err }, "Failed to ensure Kafka topic exists.");
    } finally {
      await admin.disconnect();
    }
  }
}
