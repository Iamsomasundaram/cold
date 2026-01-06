import { Injectable, NestMiddleware } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NextFunction, Request, Response } from "express";

@Injectable()
export class ApiTokenMiddleware implements NestMiddleware {
  constructor(private readonly config: ConfigService) {}

  use(req: Request, res: Response, next: NextFunction) {
    if (req.method === "OPTIONS") {
      next();
      return;
    }

    const expected = this.config.get("API_TOKEN", "dev-token");
    if (!expected) {
      next();
      return;
    }

    const headerToken =
      req.header("x-api-token") || req.header("authorization") || "";
    const token = headerToken.startsWith("Bearer ")
      ? headerToken.slice("Bearer ".length)
      : headerToken;

    if (!token || token !== expected) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    next();
  }
}
