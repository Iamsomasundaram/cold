import { Box, Chip, Stack } from "@mui/material";
import type { Summary } from "../features/dashboard/types";
import { formatNumber } from "../utils/format";

type SummaryCardsProps = {
  summary?: Summary;
  loading?: boolean;
};

const severityColor = (
  severity: string
): "default" | "warning" | "error" | "info" => {
  const normalized = severity.toLowerCase();
  if (normalized.includes("critical")) return "error";
  if (normalized.includes("warn")) return "warning";
  if (normalized.includes("info")) return "info";
  return "default";
};

export function SummaryCards({ summary, loading }: SummaryCardsProps) {
  if (!summary && !loading) {
    return (
      <Box>
        <div className="panel-header">
          <div>
            <div className="panel-title">Violation Pulse</div>
            <div className="panel-subtitle">No summary yet</div>
          </div>
        </div>
      </Box>
    );
  }

  const bySeverity = summary?.by_severity || {};
  const byViolation = summary?.by_violation_type || {};
  const topSensors = summary?.top_sensors || [];
  const topZones = summary?.top_zones || [];
  const severityCount = (target: string) => {
    const entry = Object.entries(bySeverity).find(
      ([key]) => key.toLowerCase() === target
    );
    return entry ? entry[1] : 0;
  };

  return (
    <Box>
      <div className="panel-header">
        <div>
          <div className="panel-title">Violation Pulse</div>
          <div className="panel-subtitle">Hotspots by severity</div>
        </div>
      </div>

      <div className="summary-grid">
        <div className="stat-card">
          <div className="stat-label">Total Violations</div>
          <div className="stat-value">{formatNumber(summary?.total || 0)}</div>
          <div className="panel-subtitle">Window total</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Critical</div>
          <div className="stat-value">
            {formatNumber(severityCount("critical"))}
          </div>
          <div className="panel-subtitle">Immediate attention</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Warning</div>
          <div className="stat-value">
            {formatNumber(severityCount("warning"))}
          </div>
          <div className="panel-subtitle">Follow up today</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Top Sensor</div>
          <div className="stat-value">{topSensors[0]?.key || "-"}</div>
          <div className="panel-subtitle">
            {formatNumber(topSensors[0]?.count || 0)} hits
          </div>
        </div>
      </div>

      <Stack spacing={1.5} sx={{ marginTop: 2 }}>
        <div>
          <div className="panel-subtitle">Severity mix</div>
          <div className="chip-row">
            {Object.entries(bySeverity).map(([key, value]) => (
              <Chip
                key={key}
                label={`${key}: ${formatNumber(value)}`}
                color={severityColor(key)}
                size="small"
              />
            ))}
          </div>
        </div>
        <div>
          <div className="panel-subtitle">Top zones</div>
          <div className="list">
            {topZones.slice(0, 4).map((zone) => (
              <div key={zone.key}>
                {zone.key} ({formatNumber(zone.count)})
              </div>
            ))}
            {!topZones.length && <div>-</div>}
          </div>
        </div>
        <div>
          <div className="panel-subtitle">Violation types</div>
          <div className="chip-row">
            {Object.entries(byViolation).slice(0, 6).map(([key, value]) => (
              <Chip
                key={key}
                label={`${key}: ${formatNumber(value)}`}
                size="small"
                variant="outlined"
              />
            ))}
          </div>
        </div>
      </Stack>
    </Box>
  );
}
