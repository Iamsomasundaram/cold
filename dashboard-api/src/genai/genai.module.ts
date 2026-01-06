import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { GenaiController } from "./genai.controller";
import { GenaiService } from "./genai.service";

@Module({
  imports: [ConfigModule],
  controllers: [GenaiController],
  providers: [GenaiService],
})
export class GenaiModule {}
