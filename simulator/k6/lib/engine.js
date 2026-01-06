// k6/lib/engine.js
import http from "k6/http";
import { check } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import {
  clamp,
  randBetween,
  pick,
  pickWeighted,
  chance,
  isoUtc,
  parseCsv,
  parseKeyValueCsv,
} from "./random.js";

const eventsSent = new Counter("events_sent");
const eventsFailed = new Counter("events_failed");
const eventsBadSchemaInjected = new Counter("events_bad_schema_injected");
const eventsDuplicatesSent = new Counter("events_duplicates_sent");
const httpOkRate = new Rate("http_ok_rate");
const httpLatencyMs = new Trend("http_latency_ms");

function mustGet(obj, path, msg) {
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur && Object.prototype.hasOwnProperty.call(cur, p)) cur = cur[p];
    else throw new Error(msg ?? `Missing required path: ${path}`);
  }
  return cur;
}

function readJsonFile(path) {
  const raw = open(path);
  return JSON.parse(raw);
}

function envStr(name, def) {
  const v = __ENV[name];
  return v === undefined || v === null || v === "" ? def : String(v);
}

function envNum(name, def) {
  const v = __ENV[name];
  if (v === undefined || v === null || v === "") return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function envBool(name, def) {
  const v = __ENV[name];
  if (v === undefined || v === null || v === "") return def;
  return String(v).toLowerCase() === "true";
}

function nowMs() {
  return Date.now();
}

function normalizeDistributionFromEnv(configTenants, distCsv) {
  // distCsv: "70,30" matches tenant order in config
  const parts = parseCsv(distCsv).map((x) => Number(x));
  if (!parts.length) return null;
  if (parts.length !== configTenants.length) return null;

  const out = [];
  for (let i = 0; i < configTenants.length; i++) {
    out.push({
      tenant_key: configTenants[i].tenant_key,
      weight: Number.isFinite(parts[i])
        ? parts[i]
        : configTenants[i].weight ?? 1,
      sensor_codes: configTenants[i].sensor_codes,
    });
  }
  return out;
}

function resolveTenants(globals) {
  const cfgTenants = globals.tenants ?? [];
  if (!cfgTenants.length)
    throw new Error("globals.tenants must be provided in K6_CONFIG");

  const tenantMode = envStr("TENANT_MODE", "weighted");
  const tenantKey = envStr("TENANT_KEY", "");
  const distOverride = envStr("TENANT_DISTRIBUTION", "");

  if (tenantMode === "single") {
    if (!tenantKey) throw new Error("TENANT_MODE=single requires TENANT_KEY");
    const t = cfgTenants.find((x) => x.tenant_key === tenantKey);
    if (!t) throw new Error(`Unknown TENANT_KEY=${tenantKey}`);
    return { tenantMode, tenants: [t], fixedTenant: t };
  }

  // weighted
  const overridden = distOverride
    ? normalizeDistributionFromEnv(cfgTenants, distOverride)
    : null;
  return { tenantMode, tenants: overridden ?? cfgTenants, fixedTenant: null };
}

function resolveProfiles(config, defaultLoadProfileId) {
  const loadId = envStr("LOAD_PROFILE", defaultLoadProfileId);
  const dataId = envStr("DATA_PROFILE", "DP1");

  const loadProfiles = config.load_profiles ?? [];
  const dataProfiles = config.data_profiles ?? [];

  const lp = loadProfiles.find((x) => x.id === loadId);
  if (!lp)
    throw new Error(`LOAD_PROFILE=${loadId} not found in config.load_profiles`);

  const dp = dataProfiles.find((x) => x.id === dataId);
  if (!dp)
    throw new Error(`DATA_PROFILE=${dataId} not found in config.data_profiles`);

  return { loadId, dataId, lp, dp };
}

function effectiveEndpoint(globals) {
  const base = envStr("ENDPOINT_BASE_URL", "http://localhost:8080");
  const path = envStr(
    "ENDPOINT_PATH",
    globals.endpoint?.path ?? "/v1/ingest/events"
  );
  return { base, path, url: `${base}${path}` };
}

function metricMix(globals, dp) {
  // base -> dp override -> env override
  const base = globals.default_metric_mix_percent ?? {};
  const dpMix = dp.metric_mix_override_percent ?? null;
  const envMix = parseKeyValueCsv(envStr("METRIC_MIX", ""));

  const mix = { ...(base ?? {}) };
  if (dpMix) Object.assign(mix, dpMix);
  if (Object.keys(envMix).length) Object.assign(mix, envMix);

  // Normalize to list with weights
  const items = Object.entries(mix)
    .filter(([, w]) => Number.isFinite(Number(w)) && Number(w) > 0)
    .map(([k, w]) => ({ key: k, weight: Number(w) }));

  if (!items.length)
    throw new Error(
      "Metric mix resolved empty; check config/defaults/METRIC_MIX"
    );
  return items;
}

function resolvePolicies(globals, dp) {
  const ts = { ...(globals.timestamp_policy ?? {}) };
  const payload = { ...(globals.payload_policy ?? {}) };
  const idem = { ...(globals.idempotency_policy ?? {}) };

  // profile overrides (DP5 mainly)
  if (dp.timestamp_policy_override)
    Object.assign(ts, dp.timestamp_policy_override);
  if (dp.payload_policy_override)
    Object.assign(payload, dp.payload_policy_override);
  if (dp.idempotency_policy_override)
    Object.assign(idem, dp.idempotency_policy_override);

  // env overrides
  ts.out_of_order_rate = envNum("OUT_OF_ORDER_RATE", ts.out_of_order_rate ?? 0);
  ts.late_event_rate = envNum("LATE_EVENT_RATE", ts.late_event_rate ?? 0);
  ts.max_lateness_seconds = envNum(
    "MAX_LATENESS_SECONDS",
    ts.max_lateness_seconds ?? 300
  );

  payload.raw_payload_mode = envStr(
    "RAW_PAYLOAD_MODE",
    payload.raw_payload_mode ?? "OFF"
  );
  payload.raw_payload_size = envStr(
    "RAW_PAYLOAD_SIZE",
    payload.raw_payload_size ?? "SMALL"
  );
  payload.tags_enabled = envBool("TAGS_ENABLED", payload.tags_enabled ?? true);

  idem.duplicate_event_rate = envNum(
    "DUPLICATE_EVENT_RATE",
    idem.duplicate_event_rate ?? 0
  );

  return { timestamp: ts, payload, idempotency: idem };
}

function buildRawPayload(size) {
  // Keep it JSON, not a huge string bomb. Enough to test JSONB bloat / bandwidth.
  const base = { source: "k6", kind: "synthetic", pad: "" };
  const target = size === "LARGE" ? 5000 : size === "MEDIUM" ? 1500 : 300;

  const chunk = "x".repeat(100);
  let s = "";
  while (s.length < target) s += chunk;
  base.pad = s.slice(0, target);

  return base;
}

function applyTimestampPolicy(tsPolicy, baseMs = null) {
  const now = nowMs();
  let observed = baseMs !== null && baseMs !== undefined ? Number(baseMs) : now;

  // late event: observed_at far in past
  if (chance(tsPolicy.late_event_rate ?? 0)) {
    const maxLag = Math.max(1, Number(tsPolicy.max_lateness_seconds ?? 300));
    observed = now - randBetween(30, maxLag) * 1000;
  }

  // out-of-order: small jitter backwards
  if (chance(tsPolicy.out_of_order_rate ?? 0)) {
    observed = observed - randBetween(1, 60) * 1000;
  }

  return { observed_at_ms: observed };
}

function defaultRangesByMetric(metric) {
  // fallback if no per-sensor range exists
  switch (metric) {
    case "temperature":
      return { min: 2, max: 8 };
    case "humidity":
      return { min: 40, max: 95 };
    case "co2_ppm":
      return { min: 500, max: 2500 };
    case "door_open_seconds":
      return { min: 0, max: 20 };
    case "lux":
      return { min: 0, max: 300 };
    case "power_kw":
      return { min: 50, max: 150 };
    default:
      return { min: 0, max: 100 };
  }
}

function resolveRangeForSensor(dp, tenant_key, sensor_code, metric) {
  const map = dp.value_generation?.ranges_by_tenant_and_sensor ?? null;
  const r = map?.[tenant_key]?.[sensor_code];
  if (r && Number.isFinite(r.min) && Number.isFinite(r.max)) return r;
  return defaultRangesByMetric(metric);
}

function generateInRangeValue(dp, tenant_key, sensor_code, metric) {
  const r = resolveRangeForSensor(dp, tenant_key, sensor_code, metric);
  const noise = Number(dp.value_generation?.noise_level ?? 0);
  const v = randBetween(r.min, r.max);

  // small multiplicative noise (kept bounded)
  const jitter = 1 + randBetween(-noise, noise);
  const vv = v * jitter;
  // Avoid negative for metrics that shouldn't be negative
  return metric === "temperature" ? vv : Math.max(0, vv);
}

function generateOutOfRangeValue(dp, tenant_key, sensor_code, violationDef) {
  const metric = violationDef.metric;
  const r = resolveRangeForSensor(dp, tenant_key, sensor_code, metric);

  const strat = violationDef.out_of_range_strategy ?? {
    side: "HIGH",
    min_over_by: 1,
    max_over_by: 5,
  };
  const side = strat.side ?? "HIGH";

  if (side === "LOW") {
    const underMin = Number(strat.min_under_by ?? 1);
    const underMax = Number(strat.max_under_by ?? underMin + 5);
    return r.min - randBetween(underMin, underMax);
  }

  const overMin = Number(strat.min_over_by ?? 1);
  const overMax = Number(strat.max_over_by ?? overMin + 5);
  return r.max + randBetween(overMin, overMax);
}

function pickTenant(tenantCtx) {
  if (tenantCtx.tenantMode === "single") return tenantCtx.fixedTenant;
  return pickWeighted(tenantCtx.tenants, (t) => t.weight ?? 1);
}

function pickSensorCategory(mixItems) {
  const item = pickWeighted(mixItems, (x) => x.weight);
  return item.key;
}

function pickSensorCodeForCategory(tenant, category) {
  const list = tenant.sensor_codes?.[category] ?? [];
  if (!list.length) return null;
  return pick(list);
}

function buildEventId(tenant_key, sensor_code, metric, observedMs) {
  const rand6 = Math.floor(randBetween(100000, 999999));
  return `${tenant_key}:${sensor_code}:${metric}:${observedMs}:${rand6}`;
}

function resolveRunLabel() {
  const explicit = envStr("RUN_LABEL", "");
  if (explicit) return explicit;
  const lp = envStr("LOAD_PROFILE", "LP?");
  const dp = envStr("DATA_PROFILE", "DP?");
  const tm = envStr("TENANT_MODE", "weighted");
  const ts = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13); // yyyymmddThhmm (approx)
  return `${lp}_${dp}_${tm}_${ts}`;
}

function resolveFaultRates(dp) {
  // base from dp.fault_injection + env overrides
  const f = dp.fault_injection ?? {};
  const enabled = Boolean(f.enabled);

  const unknown_sensor_rate = envNum(
    "UNKNOWN_SENSOR_RATE",
    f.unknown_sensor_rate ?? 0
  );
  const invalid_metric_rate = envNum(
    "INVALID_METRIC_RATE",
    f.invalid_metric_rate ?? 0
  );
  const bad_unit_rate = envNum("BAD_UNIT_RATE", f.bad_unit_rate ?? 0);
  const bad_json_rate = envNum("BAD_JSON_RATE", f.bad_json_rate ?? 0);

  return {
    enabled,
    unknown_sensor_rate,
    invalid_metric_rate,
    bad_unit_rate,
    bad_json_rate,
    unknown_sensor_example: f.unknown_sensor_example ?? "UNKNOWN-999",
    invalid_metric_examples: f.invalid_metric_examples ?? [
      "temp_celsius",
      "humidity_pct",
      "co2",
    ],
    bad_unit_examples: f.bad_unit_examples ?? [
      "CELSIUS",
      "percent",
      "PPM",
      "seconds",
    ],
  };
}

function resolveViolations(dp) {
  const v = dp.violations ?? { enabled: false };
  const enabled = Boolean(v.enabled);

  // rate can be overridden from env
  const rate = envNum("VIOLATION_RATE", v.rate ?? 0);

  const typeDefs = (v.types ?? []).map((t) => ({
    ...t,
    weight: Number(t.weight ?? 1),
  }));

  return {
    enabled,
    mode: v.mode ?? "NONE",
    rate,
    typeDefs,
    targeting: v.targeting ?? {},
  };
}

function incidentPlan(dp, runStartMs) {
  const inc = dp.incident_bundle ?? { enabled: false };
  if (!inc.enabled) return { enabled: false };

  const cidPrefix = inc.correlation_id_prefix ?? "inc-";
  const correlation_id = `${cidPrefix}${runStartMs}`;

  const duration = Number(inc.duration_seconds ?? 0);
  const phases = inc.phases ?? [];

  return {
    enabled: true,
    tenant_key: inc.tenant_key ?? null,
    correlation_id,
    duration_seconds: duration,
    phases,
  };
}

function pickIncidentPhase(inc, elapsedSec) {
  if (!inc.enabled) return null;
  if (elapsedSec < 0 || elapsedSec > inc.duration_seconds) return null;

  let t = elapsedSec;
  for (const ph of inc.phases) {
    const sec = Number(ph.seconds ?? 0);
    if (t <= sec) return ph;
    t -= sec;
  }
  return null;
}

function chooseViolationEvent(violations, tenantCtx, runTenant, metricReg) {
  const vType = pickWeighted(violations.typeDefs, (x) => x.weight);
  const sensor_code = pick(vType.sensor_codes ?? []);
  const metric = vType.metric;
  const unit = vType.unit;

  // If sensor_code not within current tenant set, we still allow it when weighted mode,
  // but in single-tenant mode we should try to keep it within that tenant.
  if (tenantCtx.tenantMode === "single") {
    const all = Object.values(runTenant.sensor_codes ?? {}).flat();
    if (!all.includes(sensor_code)) return null;
  }

  return { vType, sensor_code, metric, unit };
}

function generateEvent(
  ctx,
  vuState,
  runStartMs,
  elapsedSec,
  opts = { preview: false }
) {
  const preview = Boolean(opts?.preview);
  let tenant = pickTenant(ctx.tenantsCtx);
  // Force incident tenant when configured (important for weighted multi-tenant runs)
  if (ctx.incident?.enabled && ctx.incident?.tenant_key) {
    const forced =
      ctx.tenantsCtx.tenants.find(
        (t) => t.tenant_key === ctx.incident.tenant_key
      ) ||
      (ctx.tenantsCtx.fixedTenant?.tenant_key === ctx.incident.tenant_key
        ? ctx.tenantsCtx.fixedTenant
        : null);

    if (forced) tenant = forced;
  }
  const tenant_key = tenant.tenant_key;

  const baseObservedAtMs =
    opts && Number.isFinite(Number(opts.baseObservedAtMs))
      ? Number(opts.baseObservedAtMs)
      : null;

  const ts = applyTimestampPolicy(ctx.policies.timestamp, baseObservedAtMs);
  const observed_at = isoUtc(ts.observed_at_ms);

  // Incident bundle takes precedence (DP3)
  const phase = pickIncidentPhase(ctx.incident, elapsedSec);
  if (
    phase &&
    ctx.incident.tenant_key &&
    ctx.incident.tenant_key !== tenant_key
  ) {
    // during incident, force tenant
    // NOTE: if weighted mode, incident always uses configured tenant
  }

  let sensor_code = null;
  let metric = null;
  let unit = null;
  let value = null;

  const correlation_id = phase ? ctx.incident.correlation_id : null;

  const phase_name = phase ? phase.name ?? null : null;

  if (phase && phase.events?.length) {
    // choose one event from phase
    const ev = pick(phase.events);
    sensor_code = ev.sensor_code;
    metric = ev.metric;
    unit = ev.unit;
    const [mn, mx] = ev.value_range ?? [0, 1];
    value = randBetween(mn, mx);
  } else {
    // Normal / violations
    const mixCat = pickSensorCategory(ctx.metricMixItems);
    sensor_code = pickSensorCodeForCategory(tenant, mixCat);

    // If category exists but tenant has no sensors of it, fall back to any sensor_code
    if (!sensor_code) {
      const all = Object.values(tenant.sensor_codes ?? {}).flat();
      sensor_code = all.length ? pick(all) : "UNKNOWN";
    }

    const reg = ctx.metricRegistry[mixCat];
    metric = reg?.metric ?? "unknown_metric";
    unit = reg?.unit ?? "unit";

    // Apply violations if enabled
    if (
      ctx.violations.enabled &&
      chance(ctx.violations.rate) &&
      ctx.violations.typeDefs.length
    ) {
      const pickedV = chooseViolationEvent(
        ctx.violations,
        ctx.tenantsCtx,
        tenant,
        ctx.metricRegistry
      );
      if (pickedV) {
        sensor_code = pickedV.sensor_code;
        metric = pickedV.metric;
        unit = pickedV.unit;
        value = generateOutOfRangeValue(
          ctx.dataProfile,
          tenant_key,
          sensor_code,
          pickedV.vType
        );
      } else {
        value = generateInRangeValue(
          ctx.dataProfile,
          tenant_key,
          sensor_code,
          metric
        );
      }
    } else {
      value = generateInRangeValue(
        ctx.dataProfile,
        tenant_key,
        sensor_code,
        metric
      );
    }
  }

  // Build base payload
  const event_id = buildEventId(
    tenant_key,
    sensor_code,
    metric,
    ts.observed_at_ms
  );

  // scenario/data_profile are used downstream for rule routing and analytics.
  const payload = {
    tenant_key,
    event_id,
    sensor_code,
    metric,
    value: Number(value),
    unit,
    observed_at,
    scenario: ctx.scenarioName,
    data_profile: ctx.dataProfile.id,
    // correlation_id ties incident narratives across multiple sensors.
    ...(correlation_id ? { correlation_id } : {}),
  };

  // tags
  if (ctx.policies.payload.tags_enabled) {
    payload.tags = {
      run_label: ctx.runLabel,
      tenant_mode: ctx.tenantsCtx.tenantMode,
      load_profile: ctx.loadProfile.id,
      data_profile: ctx.dataProfile.id,
      ...(phase_name ? { phase: phase_name } : {}),
    };
  }

  // raw_payload (optional)
  if ((ctx.policies.payload.raw_payload_mode ?? "OFF") === "ON") {
    payload.raw_payload = buildRawPayload(
      ctx.policies.payload.raw_payload_size ?? "SMALL"
    );
  }

  // Fault injection (DP5 etc.)
  if (ctx.faults.enabled) {
    if (chance(ctx.faults.unknown_sensor_rate)) {
      payload.sensor_code = ctx.faults.unknown_sensor_example;
      if (!preview) eventsBadSchemaInjected.add(1);
    }
    if (chance(ctx.faults.invalid_metric_rate)) {
      payload.metric = pick(ctx.faults.invalid_metric_examples);
      if (!preview) eventsBadSchemaInjected.add(1);
    }
    if (chance(ctx.faults.bad_unit_rate)) {
      payload.unit = pick(ctx.faults.bad_unit_examples);
      if (!preview) eventsBadSchemaInjected.add(1);
    }
  }

  // Duplicate injection: reuse old payload exactly (idempotency test)
  if (
    ctx.policies.idempotency.duplicate_event_rate > 0 &&
    vuState.recent.length &&
    chance(ctx.policies.idempotency.duplicate_event_rate)
  ) {
    const prev = pick(vuState.recent);
    if (!preview) eventsDuplicatesSent.add(1);
    return { body: prev.body, isBadJson: prev.isBadJson };
  }

  // Bad JSON injection: send invalid JSON string
  if (ctx.faults.enabled && chance(ctx.faults.bad_json_rate)) {
    if (!preview) eventsBadSchemaInjected.add(1);
    return { body: '{"broken_json": true,', isBadJson: true };
  }

  // store recent
  const body = JSON.stringify(payload);
  vuState.recent.push({ body, isBadJson: false });
  if (vuState.recent.length > 50) vuState.recent.shift();

  return { body, isBadJson: false };
}

function buildK6Options(loadProfile) {
  // Allow quick overrides
  const duration = envNum(
    "DURATION_SECONDS",
    loadProfile.duration_seconds ?? 300
  );
  const maxVUs = loadProfile.vu_model?.max_vus ?? 200;

  const rateModel = loadProfile.rate_model ?? {
    type: "CONSTANT_EPS",
    events_per_second: 10,
  };

  // k6 scenarios
  const scenarios = {};

  const common = {
    executor: "constant-arrival-rate",
    timeUnit: "1s",
    preAllocatedVUs: Math.min(
      maxVUs,
      Math.max(
        20,
        Math.ceil(
          (envNum("EVENTS_PER_SECOND", 0) ||
            rateModel.events_per_second ||
            10) * 1.2
        )
      )
    ),
    maxVUs,
  };

  if (rateModel.type === "CONSTANT_EPS") {
    const eps = envNum("EVENTS_PER_SECOND", rateModel.events_per_second ?? 10);
    scenarios.main = {
      ...common,
      rate: eps,
      duration: `${duration}s`,
    };
    return { scenarios };
  }

  if (rateModel.type === "RAMP") {
    // ramping-arrival-rate stages: {duration, target}
    const stages = (rateModel.stages ?? []).map((s) => ({
      duration: `${Number(s.duration_seconds ?? 60)}s`,
      target: Number(s.target_eps ?? 10),
    }));

    scenarios.main = {
      executor: "ramping-arrival-rate",
      timeUnit: "1s",
      preAllocatedVUs: Math.min(
        maxVUs,
        Math.max(30, Math.ceil(Math.max(...stages.map((x) => x.target)) * 1.2))
      ),
      maxVUs,
      startRate: stages.length ? stages[0].target : 10,
      stages,
    };
    return { scenarios };
  }

  if (rateModel.type === "BURSTY") {
    const baseline = envNum("EVENTS_PER_SECOND", rateModel.baseline_eps ?? 10);
    const mult = Number(rateModel.burst_multiplier ?? 5);
    const burstRate = Math.max(1, Math.round(baseline * mult));
    const burstDur = Number(rateModel.burst_duration_seconds ?? 10);
    const every = Number(rateModel.burst_every_seconds ?? 60);

    // Baseline scenario
    scenarios.baseline = {
      ...common,
      rate: baseline,
      duration: `${duration}s`,
    };

    // Burst windows (additional load)
    let i = 0;
    for (let start = 0; start < duration; start += every) {
      scenarios[`burst_${i}`] = {
        ...common,
        rate: burstRate,
        startTime: `${start}s`,
        duration: `${Math.min(burstDur, Math.max(1, duration - start))}s`,
      };
      i++;
    }

    return { scenarios };
  }

  // fallback
  scenarios.main = {
    ...common,
    rate: 10,
    duration: `${duration}s`,
  };
  return { scenarios };
}

function summarizeOptions(options) {
  const scenarios = options?.scenarios ?? {};
  const summary = {};

  for (const [name, sc] of Object.entries(scenarios)) {
    // k6 may inject function methods into scenarios; ignore them
    if (typeof sc === "function") continue;
    if (!sc || typeof sc !== "object") continue;

    summary[name] = {
      executor: sc.executor,
      rate: sc.rate,
      duration: sc.duration,
      startTime: sc.startTime,
      stages: sc.stages,
      timeUnit: sc.timeUnit,
      preAllocatedVUs: sc.preAllocatedVUs,
      maxVUs: sc.maxVUs,
      startRate: sc.startRate,
    };
  }

  const effective = {};
  const main = summary.main;

  if (main?.executor === "constant-arrival-rate") {
    effective.model = "CONSTANT_EPS";
    effective.events_per_second = main.rate;
    effective.duration = main.duration;
  } else if (main?.executor === "ramping-arrival-rate") {
    effective.model = "RAMP";
    effective.startRate = main.startRate;
    effective.stages = main.stages;
  } else if (Object.keys(summary).length) {
    effective.model = "MULTI_SCENARIO";
    effective.scenario_names = Object.keys(summary);
  } else {
    effective.model = "UNKNOWN";
  }

  return { effective, scenarios: summary };
}

export function initEngine({ defaultLoadProfileId, scenarioName }) {
  const configPath = envStr("K6_CONFIG", "./k6_profiles.v1.json");
  const config = readJsonFile(configPath);

  const globals = mustGet(config, "globals", "K6_CONFIG must contain globals");
  const { loadId, dataId, lp, dp } = resolveProfiles(
    config,
    defaultLoadProfileId
  );

  const tenantsCtx = resolveTenants(globals);
  const endpoint = effectiveEndpoint(globals);
  const metricRegistry = globals.metric_registry ?? {};
  const metricMixItems = metricMix(globals, dp);
  const policies = resolvePolicies(globals, dp);

  const runLabel = resolveRunLabel();
  const faults = resolveFaultRates(dp);
  const violations = resolveViolations(dp);

  const options = buildK6Options(lp);
  const optionsSnapshot = JSON.parse(JSON.stringify(options));

  // Per-VU runtime state (k6 init context is per VU)
  const vuState = { recent: [] };

  const dryRun = envBool("DRY_RUN", false);
  const seed = envStr("SEED", "");
  // (k6 doesn't have seeded RNG globally without custom RNG; SEED can still be logged / used later)

  function setup() {
    const startMs = nowMs();
    return {
      startMs,
      configPath,
      load_profile: loadId,
      data_profile: dataId,
      runLabel,
      endpoint: endpoint.url,
      tenantMode: tenantsCtx.tenantMode,
      ...(tenantsCtx.tenantMode === "single"
        ? { tenantKey: tenantsCtx.fixedTenant.tenant_key }
        : {}),
      seed,
    };
  }

  function dumpPlan(data) {
    const { effective, scenarios } = summarizeOptions(optionsSnapshot);

    const plan = {
      runLabel,
      endpoint,
      load_profile_id: lp.id,
      data_profile_id: dp.id,
      load_profile: lp,
      data_profile: dp.id,
      tenant_mode: tenantsCtx.tenantMode,
      tenants: tenantsCtx.tenants.map((t) => ({
        tenant_key: t.tenant_key,
        weight: t.weight,
      })),
      policies,
      faults,
      violations: {
        enabled: violations.enabled,
        rate: violations.rate,
        types: violations.typeDefs.map(
          (t) => t.id ?? t.metric ?? "UNKNOWN_VIOLATION"
        ),
      },
      metric_mix: metricMixItems,

      // ✅ now prints the real resolved scenario config (with your overrides)
      resolved_k6: { effective, scenarios },

      // optional: show the env overrides explicitly
      resolved_overrides: {
        EVENTS_PER_SECOND: __ENV.EVENTS_PER_SECOND ?? null,
        DURATION_SECONDS: __ENV.DURATION_SECONDS ?? null,
      },
    };

    console.log(JSON.stringify(plan, null, 2));
  }

  // Incident plan depends on run start time (for correlation_id)
  let incident = { enabled: false };

  function main(data) {
    if (dryRun) {
      dumpPlan(data);

      // DRY RUN: print payload previews (but don't send)
      const previewAllPhases = envBool("DRY_RUN_PREVIEW_ALL_PHASES", false);

      if (!incident._initialized) {
        incident = { ...incidentPlan(dp, data.startMs), _initialized: true };
      }

      const ctx = {
        scenarioName,
        runLabel,
        loadProfile: lp,
        dataProfile: dp,
        tenantsCtx,
        endpoint,
        metricRegistry,
        metricMixItems,
        policies,
        faults,
        violations,
        incident,
      };

      if (previewAllPhases && incident.enabled) {
        // Print exactly one payload per incident phase (independent of elapsed time)
        const phasePayloads = [];
        let t = 0;

        for (const ph of incident.phases ?? []) {
          const phSeconds = Number(ph.seconds ?? 1);
          // pick a point inside the phase window
          // TODO: use clamp from random.js
          const elapsedSecForPhase =
            t + Math.min(1, Math.max(0.1, phSeconds / 2));

          // ✅ anchor observed_at to: runStart + phase offset
          const baseObservedAtMs =
            data.startMs + Math.round(elapsedSecForPhase * 1000);
          const ev = generateEvent(
            ctx,
            vuState,
            data.startMs,
            elapsedSecForPhase,
            { preview: true, baseObservedAtMs }
          );

          try {
            phasePayloads.push({
              phase: ph.name ?? "UNKNOWN_PHASE",
              payload: JSON.parse(ev.body),
            });
          } catch {
            phasePayloads.push({
              phase: ph.name ?? "UNKNOWN_PHASE",
              payload: { __invalid_json__: true, raw: ev.body },
            });
          }

          t += phSeconds;
        }

        console.log(
          JSON.stringify(
            { dry_run_incident_phase_payloads: phasePayloads },
            null,
            2
          )
        );
      } else {
        // Default behavior: print N sample payloads at current elapsed time
        const samples = envNum("DRY_RUN_SAMPLES", 5);
        if (samples > 0) {
          const previews = [];
          for (let i = 0; i < samples; i++) {
            const elapsedSec = (nowMs() - data.startMs) / 1000;
            const ev = generateEvent(ctx, vuState, data.startMs, elapsedSec, {
              preview: true,
            });

            try {
              previews.push(JSON.parse(ev.body));
            } catch {
              previews.push({ __invalid_json__: true, raw: ev.body });
            }
          }

          console.log(
            JSON.stringify({ dry_run_sample_payloads: previews }, null, 2)
          );
        }
      }

      return;
    }

    if (!incident._initialized) {
      incident = { ...incidentPlan(dp, data.startMs), _initialized: true };
    }

    const elapsedSec = (nowMs() - data.startMs) / 1000;

    const ctx = {
      scenarioName,
      runLabel,
      loadProfile: lp,
      dataProfile: dp,
      tenantsCtx,
      endpoint,
      metricRegistry,
      metricMixItems,
      policies,
      faults,
      violations,
      incident,
    };

    const ev = generateEvent(ctx, vuState, data.startMs, elapsedSec);

    const headers = {
      "Content-Type": "application/json",
      "X-Run-Label": runLabel,
      "X-Load-Profile": lp.id,
      "X-Data-Profile": dp.id,
    };

    const t0 = nowMs();
    const res = http.post(endpoint.url, ev.body, { headers });
    const t1 = nowMs();

    httpLatencyMs.add(t1 - t0);

    const ok = check(res, {
      "status is 2xx/3xx": (r) => r.status >= 200 && r.status < 400,
    });

    httpOkRate.add(ok);

    if (ok) eventsSent.add(1);
    else eventsFailed.add(1);
  }

  return { options, setup, main };
}
