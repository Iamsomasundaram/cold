import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { WsAdapter } from "@nestjs/platform-ws";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.useWebSocketAdapter(new WsAdapter(app));

  const port = Number.parseInt(process.env.PORT || "4200", 10);
  await app.listen(port);
  console.log(`dashboard-api listening on ${port}`);
}

bootstrap();
