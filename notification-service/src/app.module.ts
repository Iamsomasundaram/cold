import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { HealthController } from "./health.controller";
import { NotificationsModule } from "./notifications/notifications.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(
      process.env.MONGO_URL ||
        "mongodb://localhost:27017/coldstore_notifications"
    ),
    NotificationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
