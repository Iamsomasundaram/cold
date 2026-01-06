import {
  Box,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
} from "@mui/material";
import type { DetectedEvent, ViolationsResponse } from "../features/dashboard/types";
import { formatDateTime, formatNumber, formatRange } from "../utils/format";

type ViolationsTableProps = {
  violations?: ViolationsResponse;
  loading?: boolean;
};

const severityChipColor = (
  severity?: string
): "default" | "warning" | "error" | "info" => {
  if (!severity) return "default";
  const value = severity.toLowerCase();
  if (value.includes("critical")) return "error";
  if (value.includes("warn")) return "warning";
  if (value.includes("info")) return "info";
  return "default";
};

function renderTags(event: DetectedEvent) {
  if (!event.tags) return "-";
  if (Array.isArray(event.tags)) return event.tags.join(", ");
  return JSON.stringify(event.tags);
}

export function ViolationsTable({ violations, loading }: ViolationsTableProps) {
  const rows = violations?.items || [];

  return (
    <Box>
      <div className="panel-header">
        <div>
          <div className="panel-title">Latest Violations</div>
          <div className="panel-subtitle">
            {violations ? `${violations.total} events` : "Awaiting data"}
          </div>
        </div>
      </div>

      {!rows.length && !loading ? (
        <div className="panel-subtitle">No violations in this window.</div>
      ) : (
        <TableContainer className="violations-table">
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Detected</TableCell>
                <TableCell>Sensor</TableCell>
                <TableCell>Metric</TableCell>
                <TableCell>Value</TableCell>
                <TableCell>Expected</TableCell>
                <TableCell>Severity</TableCell>
                <TableCell>Violation</TableCell>
                <TableCell>Scenario</TableCell>
                <TableCell>Trace</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((event, index) => (
                <TableRow key={event.event_id || event.reading_id || index}>
                  <TableCell>{formatDateTime(event.detected_at)}</TableCell>
                  <TableCell>
                    <Tooltip
                      title={event.sensor_code || "Unknown sensor"}
                      placement="top"
                    >
                      <span>{event.sensor_code || "-"}</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell>{event.metric || "-"}</TableCell>
                  <TableCell>
                    {formatNumber(event.value)} {event.unit || ""}
                  </TableCell>
                  <TableCell>
                    {formatRange(event.expected_min, event.expected_max)}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={event.severity || "unknown"}
                      color={severityChipColor(event.severity)}
                    />
                  </TableCell>
                  <TableCell>{event.violation_type || "-"}</TableCell>
                  <TableCell>
                    {event.scenario || "-"} / {event.data_profile || "-"}
                  </TableCell>
                  <TableCell>
                    <Tooltip title={renderTags(event)}>
                      <span>{event.trace_id || "-"}</span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
