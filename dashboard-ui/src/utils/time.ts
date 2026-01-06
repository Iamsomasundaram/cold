import type { FiltersState } from "../features/filters/filtersSlice";

export function computeTimeWindow(filters: FiltersState) {
  if (filters.timeWindow) return filters.timeWindow;
  if (!filters.from || !filters.to) return undefined;

  const fromMs = Date.parse(filters.from);
  const toMs = Date.parse(filters.to);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return undefined;

  const minutes = Math.max(1, Math.round((toMs - fromMs) / 60000));
  if (minutes % 60 === 0) {
    return `${minutes / 60}h`;
  }
  return `${minutes}m`;
}
