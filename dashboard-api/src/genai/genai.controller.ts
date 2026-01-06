import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GenaiService } from "./genai.service";
import { GenaiRequest } from "./genai.types";

@Controller("api/genai")
export class GenaiController {
  constructor(
    private readonly genai: GenaiService,
    private readonly config: ConfigService
  ) {}

  @Post("insights")
  async insights(@Body() body: GenaiRequest) {
    if (!body?.question) {
      throw new BadRequestException("question is required");
    }

    const tenantKey = body.tenant_key || this.config.get("DEFAULT_TENANT_KEY");
    if (!tenantKey) {
      throw new BadRequestException("tenant_key is required");
    }

    const payload: GenaiRequest = {
      ...body,
      tenant_key: tenantKey,
      sensor_code: body.sensor_code || null,
      metric: body.metric || null,
      scenario: body.scenario || null,
      data_profile: body.data_profile || null,
      time_window: body.time_window || null,
    };

    return this.genai.requestInsights(payload);
  }
}
