import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Client } from "@elastic/elasticsearch";

@Injectable()
export class EsService {
  private readonly client: Client;
  private readonly index: string;

  constructor(private readonly config: ConfigService) {
    const node = this.config.get("ES_URL", "http://localhost:9200");
    this.index = this.config.get("ES_INDEX", "coldstore-detected-events");
    this.client = new Client({ node });
  }

  async search(body: Record<string, unknown>) {
    return this.client.search({
      index: this.index,
      body,
    });
  }
}
