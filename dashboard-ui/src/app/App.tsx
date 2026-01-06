import { Chip, LinearProgress } from "@mui/material";
import { useEffect, useMemo } from "react";
import { FiltersPanel } from "../components/FiltersPanel";
import { GenAiPanel } from "../components/GenAiPanel";
import { NotificationsPanel } from "../components/NotificationsPanel";
import { SummaryCards } from "../components/SummaryCards";
import { TimeSeriesChart } from "../components/TimeSeriesChart";
import { ViolationsTable } from "../components/ViolationsTable";
import { useAppDispatch, useAppSelector } from "./hooks";
import {
  useGetSensorsQuery,
  useGetSummaryQuery,
  useGetTenantsQuery,
  useGetTimeSeriesQuery,
  useGetViolationsQuery,
  useGetNotificationsQuery,
} from "../features/dashboard/dashboardApi";
import { setTenantKey } from "../features/filters/filtersSlice";
import { useDashboardSocket } from "../features/dashboard/useDashboardSocket";
import { formatDateTime } from "../utils/format";

export default function App() {
  const dispatch = useAppDispatch();
  const filters = useAppSelector((state) => state.filters);
  const realtime = useAppSelector((state) => state.realtime);

  const tenantsQuery = useGetTenantsQuery();
  const tenants = tenantsQuery.data || [];

  useEffect(() => {
    if (!tenants.length) return;
    if (!filters.tenantKey) {
      dispatch(setTenantKey(tenants[0].tenant_key));
      return;
    }
    const exists = tenants.some((tenant) => tenant.tenant_key === filters.tenantKey);
    if (!exists) {
      dispatch(setTenantKey(tenants[0].tenant_key));
    }
  }, [dispatch, filters.tenantKey, tenants]);

  const sensorsQuery = useGetSensorsQuery(
    { tenantKey: filters.tenantKey },
    { skip: !filters.tenantKey }
  );

  const queryFilters = useMemo(
    () => ({
      tenantKey: filters.tenantKey,
      sensorCode: filters.sensorCode || undefined,
      metric: filters.metric || undefined,
      scenario: filters.scenario || undefined,
      dataProfile: filters.dataProfile || undefined,
      severity: filters.severity || undefined,
      violationType: filters.violationType || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      timeWindow: filters.timeWindow || undefined,
    }),
    [
      filters.tenantKey,
      filters.sensorCode,
      filters.metric,
      filters.scenario,
      filters.dataProfile,
      filters.severity,
      filters.violationType,
      filters.from,
      filters.to,
      filters.timeWindow,
    ]
  );

  const summaryQuery = useGetSummaryQuery(queryFilters, {
    skip: !filters.tenantKey,
    pollingInterval: 60000,
  });
  const violationsQuery = useGetViolationsQuery(
    { ...queryFilters, limit: 50, offset: 0 },
    {
      skip: !filters.tenantKey,
      pollingInterval: 60000,
    }
  );
  const timeSeriesQuery = useGetTimeSeriesQuery(queryFilters, {
    skip: !filters.tenantKey,
    pollingInterval: 60000,
  });
  const notificationsQuery = useGetNotificationsQuery(
    { ...queryFilters, limit: 50, offset: 0 },
    {
      skip: !filters.tenantKey,
      pollingInterval: 60000,
    }
  );

  useDashboardSocket(filters);

  const summary = realtime.summary || summaryQuery.data;
  const violations = realtime.violations || violationsQuery.data;

  const isLoading =
    summaryQuery.isFetching ||
    violationsQuery.isFetching ||
    timeSeriesQuery.isFetching ||
    notificationsQuery.isFetching;

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <div className="eyebrow">Cold Storage</div>
          <h1>Operations Command Board</h1>
          <p>
            Live view of detector violations, trend curves, and GenAI guidance
            for the active tenant.
          </p>
        </div>
        <div className="status-stack">
          <Chip
            size="small"
            color={realtime.connected ? "success" : "default"}
            label={realtime.connected ? "Live WS" : "HTTP Poll"}
          />
          {summary?.updated_at && (
            <div>Updated {formatDateTime(summary.updated_at)}</div>
          )}
          {realtime.lastError && <div>{realtime.lastError}</div>}
        </div>
      </header>

      {isLoading && <LinearProgress />}

      <main className="dashboard-grid">
        <section className="panel filters">
          <FiltersPanel
            tenants={tenants}
            sensors={sensorsQuery.data || []}
            loadingTenants={tenantsQuery.isLoading}
          />
        </section>

        <section className="panel summary">
          <SummaryCards summary={summary} loading={summaryQuery.isFetching} />
        </section>

        <section className="panel chart">
          <TimeSeriesChart
            series={timeSeriesQuery.data}
            loading={timeSeriesQuery.isFetching}
          />
        </section>

        <section className="panel notifications">
          <NotificationsPanel
            deliveries={notificationsQuery.data}
            loading={notificationsQuery.isFetching}
          />
        </section>

        <section className="panel violations">
          <ViolationsTable
            violations={violations}
            loading={violationsQuery.isFetching}
          />
        </section>

        <section className="panel genai">
          <GenAiPanel />
        </section>
      </main>
    </div>
  );
}
