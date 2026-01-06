import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { MicroserviceOptions, Transport } from "@nestjs/microservices";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger("bootstrap");

  const brokers = String(config.get("KAFKA_BROKERS", "localhost:9092"))
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean);

  const clientId = config.get("KAFKA_CLIENT_ID", "notification");
  const groupId = config.get("KAFKA_GROUP_ID", "coldstore-notification-v1");

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: { brokers, clientId },
      consumer: { groupId },
    },
  });

  app.enableShutdownHooks();

  await app.startAllMicroservices();

  const port = Number(config.get("PORT", 4003));
  await app.listen(port);

  logger.log(`notification-service listening on port ${port}`);
}

bootstrap();
