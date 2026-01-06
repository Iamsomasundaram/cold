type TimeRangeInput = {
  from?: string;
  to?: string;
  timeWindow?: string;
  defaultMinutes: number;
};

function parseNumber(value: string): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function parseTimeWindowToMinutes(window: string | undefined): number | null {
  if (!window) return null;
  const trimmed = window.trim();
  if (!trimmed) return null;

  if (trimmed.endsWith("h")) {
    const hours = parseNumber(trimmed.slice(0, -1));
    return hours === null ? null : hours * 60;
  }
  if (trimmed.endsWith("m")) {
    const minutes = parseNumber(trimmed.slice(0, -1));
    return minutes === null ? null : minutes;
  }

  const fallback = parseNumber(trimmed);
  return fallback;
}

function parseTimestamp(value?: string): number | null {
  if (!value) return null;
  const numeric = parseNumber(value);
  if (numeric !== null) {
    // Assume epoch millis if it's large, seconds otherwise.
    return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function resolveTimeRange(input: TimeRangeInput) {
  const now = Date.now();
  const fromCandidate = parseTimestamp(input.from);
  const toCandidate = parseTimestamp(input.to);
  const windowMinutes =
    parseTimeWindowToMinutes(input.timeWindow) ?? input.defaultMinutes;

  const toMs = toCandidate ?? now;
  const fromMs = fromCandidate ?? toMs - windowMinutes * 60 * 1000;

  return {
    fromMs,
    toMs,
    windowMinutes,
    fromIso: new Date(fromMs).toISOString(),
    toIso: new Date(toMs).toISOString(),
  };
}

export function resolveHistogramInterval(fromMs: number, toMs: number) {
  const minutes = Math.max(1, Math.round((toMs - fromMs) / 60000));

  if (minutes <= 120) return "5m";
  if (minutes <= 1440) return "15m";
  return "1h";
}
