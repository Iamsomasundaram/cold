import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type {
  GenaiRequest,
  GenaiResponse,
  NotificationDeliveriesResponse,
  Sensor,
  Summary,
  Tenant,
  TimeSeriesResponse,
  ViolationsResponse,
} from "./types";

export type DashboardQueryFilters = {
  tenantKey: string;
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

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:4200/api"
).replace(/\/+$/, "");
const API_TOKEN = import.meta.env.VITE_API_TOKEN || "";

function buildQueryString(filters: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}

function toQueryParams(filters: DashboardQueryFilters) {
  return buildQueryString({
    tenant_key: filters.tenantKey,
    sensor_code: filters.sensorCode,
    metric: filters.metric,
    scenario: filters.scenario,
    data_profile: filters.dataProfile,
    severity: filters.severity,
    violation_type: filters.violationType,
    from: filters.from,
    to: filters.to,
    time_window: filters.timeWindow,
  });
}

export const dashboardApi = createApi({
  reducerPath: "dashboardApi",
  baseQuery: fetchBaseQuery({
    baseUrl: API_BASE_URL,
    prepareHeaders: (headers) => {
      if (API_TOKEN) {
        headers.set("x-api-token", API_TOKEN);
      }
      return headers;
    },
  }),
  endpoints: (builder) => ({
    getTenants: builder.query<Tenant[], void>({
      query: () => "tenants",
    }),
    getSensors: builder.query<Sensor[], { tenantKey: string }>({
      query: ({ tenantKey }) =>
        `sensors?${buildQueryString({ tenant_key: tenantKey })}`,
    }),
    getSummary: builder.query<Summary, DashboardQueryFilters>({
      query: (filters) => `summary?${toQueryParams(filters)}`,
    }),
    getViolations: builder.query<
      ViolationsResponse,
      DashboardQueryFilters & { limit?: number; offset?: number }
    >({
      query: (filters) =>
        `violations?${buildQueryString({
          ...filters,
          tenantKey: undefined,
          sensorCode: undefined,
          dataProfile: undefined,
          violationType: undefined,
          timeWindow: undefined,
          tenant_key: filters.tenantKey,
          sensor_code: filters.sensorCode,
          data_profile: filters.dataProfile,
          violation_type: filters.violationType,
          time_window: filters.timeWindow,
          limit: filters.limit ? String(filters.limit) : undefined,
          offset: filters.offset ? String(filters.offset) : undefined,
        })}`,
    }),
    getTimeSeries: builder.query<TimeSeriesResponse, DashboardQueryFilters>({
      query: (filters) => `timeseries?${toQueryParams(filters)}`,
    }),
    getNotifications: builder.query<
      NotificationDeliveriesResponse,
      DashboardQueryFilters & { limit?: number; offset?: number }
    >({
      query: (filters) =>
        `notifications/deliveries?${buildQueryString({
          tenant_key: filters.tenantKey,
          sensor_code: filters.sensorCode,
          severity: filters.severity,
          from: filters.from,
          to: filters.to,
          time_window: filters.timeWindow,
          limit: filters.limit ? String(filters.limit) : undefined,
          offset: filters.offset ? String(filters.offset) : undefined,
        })}`,
    }),
    askGenai: builder.mutation<GenaiResponse, GenaiRequest>({
      query: (body) => ({
        url: "genai/insights",
        method: "POST",
        body,
      }),
    }),
  }),
});

export const {
  useGetTenantsQuery,
  useGetSensorsQuery,
  useGetSummaryQuery,
  useGetViolationsQuery,
  useGetTimeSeriesQuery,
  useGetNotificationsQuery,
  useAskGenaiMutation,
} = dashboardApi;
