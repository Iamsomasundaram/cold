export function formatDateTime(value?: number | string | null) {
  if (value === undefined || value === null) return "-";
  const date =
    typeof value === "number" ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatNumber(value?: number | null) {
  if (value === undefined || value === null) return "-";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatRange(min?: number | null, max?: number | null) {
  if (min === undefined && max === undefined) return "-";
  const minLabel =
    min === undefined || min === null ? "-" : formatNumber(min);
  const maxLabel =
    max === undefined || max === null ? "-" : formatNumber(max);
  return `${minLabel} to ${maxLabel}`;
}
