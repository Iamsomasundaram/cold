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
import type {
  NotificationDeliveriesResponse,
  NotificationDelivery,
} from "../features/dashboard/types";
import { formatDateTime } from "../utils/format";

type NotificationsPanelProps = {
  deliveries?: NotificationDeliveriesResponse;
  loading?: boolean;
};

const statusChipColor = (
  status?: string
): "default" | "success" | "warning" | "error" | "info" => {
  if (!status) return "default";
  const value = status.toLowerCase();
  if (value.includes("sent")) return "success";
  if (value.includes("failed")) return "error";
  if (value.includes("suppressed")) return "warning";
  if (value.includes("skipped")) return "info";
  return "default";
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

function renderMeta(delivery: NotificationDelivery) {
  const parts: string[] = [];
  if (delivery.correlation_id) {
    parts.push(`corr: ${delivery.correlation_id}`);
  }
  if (delivery.tags) {
    const tagValue = Array.isArray(delivery.tags)
      ? delivery.tags.join(", ")
      : JSON.stringify(delivery.tags);
    parts.push(`tags: ${tagValue}`);
  }
  return parts.length ? parts.join(" | ") : "-";
}

export function NotificationsPanel({
  deliveries,
  loading,
}: NotificationsPanelProps) {
  const rows = deliveries?.items || [];
  const statusCounts = rows.reduce<Record<string, number>>((acc, item) => {
    const key = item.status || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return (
    <Box>
      <div className="panel-header">
        <div>
          <div className="panel-title">Notifications</div>
          <div className="panel-subtitle">
            {deliveries
              ? `${deliveries.total} deliveries`
              : "Awaiting data"}
          </div>
        </div>
      </div>

      {!!rows.length && (
        <div className="chip-row">
          {Object.entries(statusCounts).map(([status, count]) => (
            <Chip
              key={status}
              size="small"
              color={statusChipColor(status)}
              label={`${status}: ${count}`}
            />
          ))}
        </div>
      )}

      {!rows.length && !loading ? (
        <div className="panel-subtitle">No notifications in this window.</div>
      ) : (
        <TableContainer className="notifications-table">
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Detected</TableCell>
                <TableCell>Sensor</TableCell>
                <TableCell>Severity</TableCell>
                <TableCell>Channel</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Reason</TableCell>
                <TableCell>Trace</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((delivery, index) => (
                <TableRow
                  key={
                    delivery.event_id ||
                    delivery.reading_id ||
                    `${delivery.sensor_code}-${index}`
                  }
                >
                  <TableCell>{formatDateTime(delivery.detected_at)}</TableCell>
                  <TableCell>{delivery.sensor_code || "-"}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={delivery.severity || "unknown"}
                      color={severityChipColor(delivery.severity)}
                    />
                  </TableCell>
                  <TableCell>{delivery.channel || "-"}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={delivery.status || "unknown"}
                      color={statusChipColor(delivery.status)}
                    />
                  </TableCell>
                  <TableCell>{delivery.reason || "-"}</TableCell>
                  <TableCell>
                    <Tooltip title={renderMeta(delivery)} placement="top">
                      <span>{delivery.trace_id || "-"}</span>
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
