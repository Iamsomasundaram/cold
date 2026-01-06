import { Box } from "@mui/material";
import ReactECharts from "echarts-for-react";
import { useMemo } from "react";
import type { TimeSeriesResponse } from "../features/dashboard/types";

type TimeSeriesChartProps = {
  series?: TimeSeriesResponse;
  loading?: boolean;
};

const severityPalette: Record<string, string> = {
  critical: "#d1495b",
  warning: "#f2b880",
  info: "#5fa8d3",
};

export function TimeSeriesChart({ series, loading }: TimeSeriesChartProps) {
  const option = useMemo(() => {
    if (!series) return null;

    const buckets = series.buckets || [];
    const severityKeys = new Set<string>();
    buckets.forEach((bucket) => {
      Object.keys(bucket.by_severity || {}).forEach((key) =>
        severityKeys.add(key)
      );
    });

    const keys = Array.from(severityKeys);
    const chartSeries = keys.length
      ? keys.map((key) => ({
          name: key,
          type: "line",
          smooth: true,
          stack: "violations",
          showSymbol: false,
          areaStyle: { opacity: 0.25 },
          data: buckets.map((bucket) => [
            bucket.ts,
            bucket.by_severity?.[key] || 0,
          ]),
          itemStyle: {
            color: severityPalette[key] || "#0b7a75",
          },
        }))
      : [
          {
            name: "total",
            type: "line",
            smooth: true,
            showSymbol: false,
            data: buckets.map((bucket) => [bucket.ts, bucket.count]),
          },
        ];

    return {
      tooltip: {
        trigger: "axis",
      },
      legend: {
        top: 10,
      },
      grid: {
        left: 40,
        right: 20,
        top: 50,
        bottom: 40,
      },
      xAxis: {
        type: "time",
        axisLabel: { color: "#4f5b55" },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#4f5b55" },
      },
      series: chartSeries,
    };
  }, [series]);

  return (
    <Box>
      <div className="panel-header">
        <div>
          <div className="panel-title">Violation Trend</div>
          <div className="panel-subtitle">Stacked by severity</div>
        </div>
      </div>
      {!series && !loading ? (
        <div className="panel-subtitle">No time series data yet</div>
      ) : (
        <ReactECharts
          option={option || {}}
          style={{ height: 280 }}
          showLoading={loading}
        />
      )}
    </Box>
  );
}
