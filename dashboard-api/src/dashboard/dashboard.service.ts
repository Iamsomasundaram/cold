import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { resolveHistogramInterval, resolveTimeRange } from "../common/time";
import { EsService } from "./es.service";

type DashboardFilters = {
  tenantKey?: string;
  sensorCode?: string;
  metric?: string;
  scenario?: string;
  dataProfile?: string;
  severity?: string;
  violationType?: string;
  from?: string;
  to?: string;
  timeWindow?: string;
};

type SearchResult = {
  hits: {
    total: { value: number };
    hits: Array<{ _source: Record<string, unknown> }>;
  };
  aggregations?: Record<string, any>;
};

const MAX_LIMIT = 500;

@Injectable()
export class DashboardService {
  constructor(
    private readonly es: EsService,
    private readonly config: ConfigService
  ) {}

  private getDefaultWindowMinutes() {
    return Number(this.config.get("DEFAULT_TIME_WINDOW_MINUTES", 120));
  }

  private extractPayload(result: any): SearchResult {
    return result && result.body ? result.body : result;
  }

  private buildMust(filters: DashboardFilters, includeViolations: boolean) {
    if (!filters.tenantKey) {
      throw new BadRequestException("tenant_key is required");
    }

    const must: Array<Record<string, unknown>> = [];
    const keywordField = (field: string) => `${field}.keyword`;
    const addTerm = (field: string, value?: string) => {
      if (value) must.push({ term: { [field]: value } });
    };

    addTerm(keywordField("tenant_key"), filters.tenantKey);
    addTerm(keywordField("sensor_code"), filters.sensorCode);
    addTerm(keywordField("metric"), filters.metric);
    addTerm(keywordField("scenario"), filters.scenario);
    addTerm(keywordField("data_profile"), filters.dataProfile);
    addTerm(keywordField("severity"), filters.severity);
    addTerm(keywordField("violation_type"), filters.violationType);

    if (includeViolations) {
      must.push({ term: { has_violation: true } });
    }

    return must;
  }

  private buildRange(filters: DashboardFilters) {
    const range = resolveTimeRange({
      from: filters.from,
      to: filters.to,
      timeWindow: filters.timeWindow,
      defaultMinutes: this.getDefaultWindowMinutes(),
    });

    return {
      rangeFilter: {
        range: {
          detected_at: {
            gte: range.fromMs,
            lte: range.toMs,
          },
        },
      },
      range,
    };
  }

  private bucketsToMap(buckets: Array<{ key: string; doc_count: number }>) {
    const out: Record<string, number> = {};
    for (const bucket of buckets || []) {
      out[bucket.key] = bucket.doc_count;
    }
    return out;
  }

  private bucketsToList(buckets: Array<{ key: string; doc_count: number }>) {
    return (buckets || []).map((bucket) => ({
      key: bucket.key,
      count: bucket.doc_count,
    }));
  }

  async getSummary(filters: DashboardFilters) {
    const must = this.buildMust(filters, true);
    const { rangeFilter, range } = this.buildRange(filters);

    const body = {
      size: 0,
      query: {
        bool: {
          must,
          filter: [rangeFilter],
        },
      },
      aggs: {
        by_severity: { terms: { field: "severity.keyword", size: 10 } },
        by_violation_type: {
          terms: { field: "violation_type.keyword", size: 10 },
        },
        by_sensor: { terms: { field: "sensor_code.keyword", size: 10 } },
        by_metric: { terms: { field: "metric.keyword", size: 10 } },
        by_zone: { terms: { field: "location.zone.keyword", size: 10 } },
      },
    };

    const raw = await this.es.search(body);
    const payload = this.extractPayload(raw);
    const aggs = payload.aggregations || {};

    return {
      from: range.fromIso,
      to: range.toIso,
      total: payload.hits.total.value,
      by_severity: this.bucketsToMap(aggs.by_severity?.buckets || []),
      by_violation_type: this.bucketsToMap(
        aggs.by_violation_type?.buckets || []
      ),
      top_sensors: this.bucketsToList(aggs.by_sensor?.buckets || []),
      top_metrics: this.bucketsToList(aggs.by_metric?.buckets || []),
      top_zones: this.bucketsToList(aggs.by_zone?.buckets || []),
      updated_at: new Date().toISOString(),
    };
  }

  async getViolations(filters: DashboardFilters, limit = 50, offset = 0) {
    const must = this.buildMust(filters, true);
    const { rangeFilter, range } = this.buildRange(filters);

    const size = Math.min(Math.max(1, limit), MAX_LIMIT);
    const from = Math.max(0, offset);

    const body = {
      size,
      from,
      sort: [{ detected_at: { order: "desc" } }],
      query: {
        bool: {
          must,
          filter: [rangeFilter],
        },
      },
    };

    const raw = await this.es.search(body);
    const payload: SearchResult = this.extractPayload(raw);

    return {
      from: range.fromIso,
      to: range.toIso,
      total: payload.hits.total.value,
      items: payload.hits.hits.map((hit) => hit._source),
    };
  }

  async getTimeSeries(filters: DashboardFilters, interval?: string) {
    const must = this.buildMust(filters, true);
    const { rangeFilter, range } = this.buildRange(filters);
    const bucketInterval =
      interval || resolveHistogramInterval(range.fromMs, range.toMs);

    const body = {
      size: 0,
      query: {
        bool: {
          must,
          filter: [rangeFilter],
        },
      },
      aggs: {
        by_interval: {
          date_histogram: {
            field: "detected_at",
            fixed_interval: bucketInterval,
            min_doc_count: 0,
            extended_bounds: {
              min: range.fromMs,
              max: range.toMs,
            },
          },
          aggs: {
            by_severity: { terms: { field: "severity.keyword", size: 5 } },
            by_violation_type: {
              terms: { field: "violation_type.keyword", size: 10 },
            },
          },
        },
      },
    };

    const raw = await this.es.search(body);
    const payload = this.extractPayload(raw);
    const buckets = payload.aggregations?.by_interval?.buckets || [];

    return {
      from: range.fromIso,
      to: range.toIso,
      interval: bucketInterval,
      buckets: buckets.map((bucket: any) => ({
        ts: bucket.key,
        count: bucket.doc_count,
        by_severity: this.bucketsToMap(bucket.by_severity?.buckets || []),
        by_violation_type: this.bucketsToMap(
          bucket.by_violation_type?.buckets || []
        ),
      })),
    };
  }
}
