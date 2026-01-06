// k6/lib/random.js

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function randInt(min, max) {
  // inclusive
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randBetween(min, max) {
  return Math.random() * (max - min) + min;
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function chance(p) {
  return Math.random() < p;
}

export function pickWeighted(items, getWeight = (x) => x.weight ?? 1) {
  const total = items.reduce(
    (s, it) => s + Math.max(0, Number(getWeight(it)) || 0),
    0
  );
  if (total <= 0) return items[0];

  let r = Math.random() * total;
  for (const it of items) {
    r -= Math.max(0, Number(getWeight(it)) || 0);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

export function isoUtc(ms) {
  return new Date(ms).toISOString();
}

export function parseCsv(str) {
  if (!str) return [];
  return str
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseKeyValueCsv(str) {
  // TEMP=30,HUMIDITY=20...
  const out = {};
  if (!str) return out;
  for (const part of str.split(",")) {
    const [k, v] = part.split("=").map((s) => (s ?? "").trim());
    if (!k) continue;
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    out[k] = n;
  }
  return out;
}
