## Run command design (profiles as params)

We’ll standardize **one universal CLI shape** across all 3 scripts, so you can mix-and-match load+data profiles without editing code.

### Common params (all scripts)

- `K6_CONFIG` → path to the JSON config file (e.g., `k6_profiles.v1.json`)
- `LOAD_PROFILE` → `LP1|LP2|LP3`
- `DATA_PROFILE` → `DP1|DP2|DP3|DP4|DP5`
- `TENANT_MODE` → `single|weighted`
- If `TENANT_MODE=single`: `TENANT_KEY=potato_wh|healthcare_fac`
- If `TENANT_MODE=weighted`: use weights from config (optionally override with `TENANT_DISTRIBUTION`)

Optional but useful:

- `RUN_LABEL` (tag runs: “baseline”, “peak-violations”, etc.)
- `ENDPOINT_BASE_URL` (switch envs)
- `SEED` (repeatability for randomness)
- `DRY_RUN=true` (prints planned mix without sending—nice for debugging)

---

## Canonical command templates

### Template A — Single-tenant (Option A)

Use this when validating domain logic, detector correctness, and per-tenant DB performance.

**Steady**

```bash
k6 run steady_traffic.js \
  -e K6_CONFIG=./k6_profiles.v1.json \
  -e LOAD_PROFILE=LP1 \
  -e DATA_PROFILE=DP1 \
  -e TENANT_MODE=single \
  -e TENANT_KEY=potato_wh \
  -e RUN_LABEL=potato_lp1_dp1
```

**Busy-hour**

```bash
k6 run busy_hour_traffic.js \
  -e K6_CONFIG=./k6_profiles.v1.json \
  -e LOAD_PROFILE=LP2 \
  -e DATA_PROFILE=DP2 \
  -e TENANT_MODE=single \
  -e TENANT_KEY=potato_wh \
  -e RUN_LABEL=potato_lp2_dp2
```

**Burst**

```bash
k6 run burst_traffic.js \
  -e K6_CONFIG=./k6_profiles.v1.json \
  -e LOAD_PROFILE=LP3 \
  -e DATA_PROFILE=DP5 \
  -e TENANT_MODE=single \
  -e TENANT_KEY=healthcare_fac \
  -e RUN_LABEL=hc_lp3_dp5
```

### Template B — Weighted multi-tenant (Option B)

Use this when testing noisy-neighbor, fairness, shared infra saturation, autoscaling, etc.

**Weighted using config weights**

```bash
k6 run busy_hour_traffic.js \
  -e K6_CONFIG=./k6_profiles.v1.json \
  -e LOAD_PROFILE=LP2 \
  -e DATA_PROFILE=DP2 \
  -e TENANT_MODE=weighted \
  -e RUN_LABEL=weighted_lp2_dp2
```

**Weighted with override distribution (optional)**

```bash
k6 run burst_traffic.js \
  -e K6_CONFIG=./k6_profiles.v1.json \
  -e LOAD_PROFILE=LP3 \
  -e DATA_PROFILE=DP5 \
  -e TENANT_MODE=weighted \
  -e TENANT_DISTRIBUTION=80,20 \
  -e RUN_LABEL=weighted80_20_lp3_dp5
```

---

## Suggested “official” run matrix (starter suite)

### A) Domain validation (single-tenant)

1. Potato baseline

- `LP1 + DP1 + potato_wh`

2. Potato peak with controlled violations

- `LP2 + DP2 + potato_wh`

3. Potato incident narrative

- `LP1 + DP3 + potato_wh`

4. Healthcare compliance baseline

- `LP1 + DP4 + healthcare_fac`

5. Healthcare burst chaos (DLQ/duplicates)

- `LP3 + DP5 + healthcare_fac`

### B) System design validation (weighted multi-tenant)

6. Busy hour + violations + tenant skew (noisy neighbor)

- `LP2 + DP2 + weighted (70/30 or 80/20)`

7. Burst chaos + weighted

- `LP3 + DP5 + weighted`

8. Long endurance baseline weighted

- `LP1 + DP1 + weighted`

---

## A small “discipline” rule (so runs are traceable)

Always set:

- `RUN_LABEL`
- and include `LOAD_PROFILE`, `DATA_PROFILE`, `TENANT_MODE` as tags in every event

That will make:

- DB queries
- Grafana dashboards
- and debugging in logs
  much easier.

---

## What “k6 v2 scripts” should look like (high-level, no code)

All three scripts should:

1. Load JSON from `K6_CONFIG`
2. Pick `LOAD_PROFILE` and `DATA_PROFILE`
3. Determine tenant selection:

   - `single` → only `TENANT_KEY` sensor set
   - `weighted` → pick tenant by weights / override distribution

4. Generate events according to DP rules (baseline vs violations vs incident vs chaos)
5. Apply LP shaping (steady/ramp/burst)

Even better: internally they can share a single “engine”, and the 3 scripts just differ by which `LOAD_PROFILE` they default to.

---

## Final env var list (v2) + default behaviors

This is the “contract” your v2 scripts will follow. If you stick to this, you can add new matrices without touching code.

---

## 1) Required env vars (strict)

### Config + profile selection

- `K6_CONFIG`

  - **Default:** `./k6_profiles.v1.json`
  - **Meaning:** path to the profiles JSON

- `LOAD_PROFILE`

  - **Default:** script-specific

    - `steady_traffic.js` → `LP1`
    - `busy_hour_traffic.js` → `LP2`
    - `burst_traffic.js` → `LP3`

  - **Meaning:** which load profile block to use

- `DATA_PROFILE`

  - **Default:** `DP1`
  - **Meaning:** which data profile block to use

### Tenant selection mode

- `TENANT_MODE`

  - **Allowed:** `single | weighted`
  - **Default:** `weighted`

- `TENANT_KEY`

  - **Required only if:** `TENANT_MODE=single`
  - **Allowed:** `potato_wh | healthcare_fac`

---

## 2) Optional overrides (high value)

### Endpoint routing

- `ENDPOINT_BASE_URL`

  - **Default:** `http://localhost:8080` (or your ingest-api default)

- `ENDPOINT_PATH`

  - **Default:** use `globals.endpoint.path` from config (e.g., `/v1/ingest/events`)

### Run identity (for tracing/debug)

- `RUN_LABEL`

  - **Default:** auto-generate: `<LOAD_PROFILE>_<DATA_PROFILE>_<TENANT_MODE>_<yyyymmddHHMM>`

- `SEED`

  - **Default:** none (random)
  - **Behavior:** if set, randomness becomes repeatable

### Weighted multi-tenant override

- `TENANT_DISTRIBUTION`

  - **Only valid if:** `TENANT_MODE=weighted`
  - **Format:** `70,30`
  - **Default:** use weights in `globals.tenants[]`
  - **Behavior:** order follows config tenant order

### Data shaping overrides (for quick experiments)

- `EVENTS_PER_SECOND`

  - **Default:** from `LOAD_PROFILE.rate_model`

- `DURATION_SECONDS`

  - **Default:** from `LOAD_PROFILE.duration_seconds`

- `METRIC_MIX`

  - **Format:** `TEMP=30,HUMIDITY=20,DOOR=15,GAS=15,LIGHT=10,ENERGY=10`
  - **Default:** from `DATA_PROFILE.metric_mix_override_percent` else `globals.default_metric_mix_percent`

### Fault knobs (quick hardening tests)

- `DUPLICATE_EVENT_RATE`
- `UNKNOWN_SENSOR_RATE`
- `INVALID_METRIC_RATE`
- `BAD_UNIT_RATE`
- `BAD_JSON_RATE`
- Defaults: from DP5 overrides when DP5 is selected; otherwise 0.

### Time disorder knobs

- `OUT_OF_ORDER_RATE`
- `LATE_EVENT_RATE`
- `MAX_LATENESS_SECONDS`
- Defaults: from globals unless DP5 overrides are active.

### Payload size knobs

- `RAW_PAYLOAD_MODE` → `OFF|ON`
- `RAW_PAYLOAD_SIZE` → `SMALL|MEDIUM|LARGE`
- Defaults: from globals unless DP5 overrides are active.

### Debug mode

- `DRY_RUN=true|false`

  - **Default:** `false`
  - **Behavior:** prints the resolved plan (profile merge result) and exits, no HTTP calls

---

## 3) Default merge rules (super important)

When the script starts, it resolves a final “effective config” in this priority order:

1. **Base config** from `K6_CONFIG`
2. Overlay **chosen Load Profile**
3. Overlay **chosen Data Profile**
4. Overlay **env var overrides** (highest priority)

This ensures:

- DP5 can override timestamp/payload/idempotency policies
- You can still override DP5 quickly from CLI if needed

---

## 4) Final “official” run commands (clean suite)

### Option A: Single-tenant runs

**A1 — Potato baseline endurance**

```bash
k6 run steady_traffic.js \
  -e K6_CONFIG=./k6_profiles.v1.json \
  -e DATA_PROFILE=DP1 \
  -e TENANT_MODE=single \
  -e TENANT_KEY=potato_wh \
  -e RUN_LABEL=potato_baseline_lp1_dp1
```

**A2 — Potato busy hour + controlled violations**

```bash
k6 run busy_hour_traffic.js \
  -e K6_CONFIG=./k6_profiles.v1.json \
  -e DATA_PROFILE=DP2 \
  -e TENANT_MODE=single \
  -e TENANT_KEY=potato_wh \
  -e RUN_LABEL=potato_peak_violations_lp2_dp2
```

**A3 — Potato incident narrative (correlated)**

```bash
k6 run steady_traffic.js \
  -e K6_CONFIG=./k6_profiles.v1.json \
  -e DATA_PROFILE=DP3 \
  -e TENANT_MODE=single \
  -e TENANT_KEY=potato_wh \
  -e RUN_LABEL=potato_incident_lp1_dp3
```

**A4 — Healthcare compliance**

```bash
k6 run steady_traffic.js \
  -e K6_CONFIG=./k6_profiles.v1.json \
  -e DATA_PROFILE=DP4 \
  -e TENANT_MODE=single \
  -e TENANT_KEY=healthcare_fac \
  -e RUN_LABEL=healthcare_compliance_lp1_dp4
```

**A5 — Healthcare burst chaos (DLQ/duplicates/out-of-order)**

```bash
k6 run burst_traffic.js \
  -e K6_CONFIG=./k6_profiles.v1.json \
  -e DATA_PROFILE=DP5 \
  -e TENANT_MODE=single \
  -e TENANT_KEY=healthcare_fac \
  -e RUN_LABEL=healthcare_burst_chaos_lp3_dp5
```

---

### Option B: Weighted multi-tenant runs

**B1 — Weighted baseline endurance (noisy-neighbor baseline)**

```bash
k6 run steady_traffic.js \
  -e K6_CONFIG=./k6_profiles.v1.json \
  -e DATA_PROFILE=DP1 \
  -e TENANT_MODE=weighted \
  -e RUN_LABEL=weighted_baseline_lp1_dp1
```

**B2 — Weighted busy hour + violations**

```bash
k6 run busy_hour_traffic.js \
  -e K6_CONFIG=./k6_profiles.v1.json \
  -e DATA_PROFILE=DP2 \
  -e TENANT_MODE=weighted \
  -e RUN_LABEL=weighted_peak_violations_lp2_dp2
```

**B3 — Weighted burst chaos (platform hardening)**

```bash
k6 run burst_traffic.js \
  -e K6_CONFIG=./k6_profiles.v1.json \
  -e DATA_PROFILE=DP5 \
  -e TENANT_MODE=weighted \
  -e RUN_LABEL=weighted_burst_chaos_lp3_dp5
```

**B4 — Weighted skew test (noisy neighbor deliberately)**

```bash
k6 run busy_hour_traffic.js \
  -e K6_CONFIG=./k6_profiles.v1.json \
  -e DATA_PROFILE=DP2 \
  -e TENANT_MODE=weighted \
  -e TENANT_DISTRIBUTION=90,10 \
  -e RUN_LABEL=weighted_skew90_10_lp2_dp2
```

---

## 5) “Done criteria” before we start coding v2

We’re ready to implement v2 once you confirm these are locked:

1. Env var names exactly as above
2. Merge priority rules
3. Default profile selection per script
4. The canonical event contract (no location fields)
