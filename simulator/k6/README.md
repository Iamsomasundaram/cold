# Cold Storage k6 Simulator

Generates synthetic cold storage telemetry and sends JSON events to ingest-api.
Supports load profiles (LP), data profiles (DP), multi-tenant modes, and a
DRY_RUN mode that prints sample payloads without sending HTTP requests.

## Scripts
- `steady_traffic.js` (defaults to `LP1`)
- `busy_hour_traffic.js` (defaults to `LP2`)
- `burst_traffic.js` (defaults to `LP3`)

## Folder layout
```
k6/
  .env.example
  k6_profiles.v1.json
  lib/
  steady_traffic.js
  busy_hour_traffic.js
  burst_traffic.js
```

## Run via Docker
```powershell
docker run --rm `
  -e K6_CONFIG="k6_profiles.v1.json" `
  -v "D:\...\simulator\k6:/work" `
  -w /work `
  grafana/k6 `
  run steady_traffic.js
```

## Event contract
Each event is a single JSON object (one reading).

Required fields:
- `tenant_key`
- `event_id`
- `sensor_code`
- `metric`
- `value`
- `unit`
- `observed_at` (ISO timestamp)
- `scenario` (LP name)
- `data_profile` (DP name)

Optional fields:
- `correlation_id`
- `trace_id`
- `tags` (object)
- `raw_payload` (object)

Location is derived downstream from `sensor_code` using the sensor master data.

Sample:
```json
{
  "tenant_key": "potato_wh",
  "event_id": "evt-001",
  "sensor_code": "PW-CH1-TEMP-01",
  "metric": "temperature",
  "value": 6.2,
  "unit": "C",
  "observed_at": "2026-01-02T10:00:00Z",
  "scenario": "LP2",
  "data_profile": "DP2",
  "correlation_id": "run-42",
  "trace_id": "trace-abc",
  "tags": {
    "run_label": "potato_peak_violations_lp2_dp2"
  }
}
```

## Environment variables
See `.env.example` for the full list. Common essentials:
- `K6_CONFIG` (path to JSON config)
- `LOAD_PROFILE` (`LP1|LP2|LP3`)
- `DATA_PROFILE` (`DP1..DP5`)
- `TENANT_MODE` (`single|weighted`)
- `TENANT_KEY` (required if `TENANT_MODE=single`)
- `ENDPOINT_BASE_URL`, `ENDPOINT_PATH`
- `EVENTS_PER_SECOND`, `DURATION_SECONDS`
- `RUN_LABEL`

If you are using `ingest-api/docker-compose.kafka.yml`, the ingest-api host
port is `8088`, so set `ENDPOINT_BASE_URL=http://localhost:8088`.

## DRY_RUN (plan and payload preview)
```powershell
docker run --rm `
  -e K6_CONFIG="k6_profiles.v1.json" `
  -e DATA_PROFILE="DP2" `
  -e TENANT_MODE="single" `
  -e TENANT_KEY="potato_wh" `
  -e DRY_RUN="true" `
  -e DRY_RUN_SAMPLES="5" `
  -v "D:\...\simulator\k6:/work" `
  -w /work `
  grafana/k6 `
  run steady_traffic.js
```

## Example runs
Single tenant, baseline:
```powershell
docker run --rm `
  -e K6_CONFIG="k6_profiles.v1.json" `
  -e DATA_PROFILE="DP1" `
  -e TENANT_MODE="single" `
  -e TENANT_KEY="potato_wh" `
  -e RUN_LABEL="potato_baseline_lp1_dp1" `
  -v "D:\...\simulator\k6:/work" `
  -w /work grafana/k6 run steady_traffic.js
```

Single tenant, violations:
```powershell
docker run --rm `
  -e K6_CONFIG="k6_profiles.v1.json" `
  -e DATA_PROFILE="DP2" `
  -e TENANT_MODE="single" `
  -e TENANT_KEY="potato_wh" `
  -e RUN_LABEL="potato_peak_violations_lp2_dp2" `
  -v "D:\...\simulator\k6:/work" `
  -w /work grafana/k6 run busy_hour_traffic.js
```

Weighted multi-tenant:
```powershell
docker run --rm `
  -e K6_CONFIG="k6_profiles.v1.json" `
  -e DATA_PROFILE="DP2" `
  -e TENANT_MODE="weighted" `
  -e RUN_LABEL="weighted_peak_violations_lp2_dp2" `
  -v "D:\...\simulator\k6:/work" `
  -w /work grafana/k6 run busy_hour_traffic.js
```

## Load profiles (LP)
- `LP1` steady traffic baseline
- `LP2` busy hour ramp and sustained load
- `LP3` bursty spikes

## Data profiles (DP)
- `DP1` normal in-range telemetry
- `DP2` controlled violations at a known rate
- `DP3` incident narrative with correlated sensors
- `DP4` compliance-like narrow ranges
- `DP5` chaos and edge cases (bad data, duplicates, large payloads)

## Tips
- Set `RUN_LABEL` so downstream logs and queries can group a run.
- Use `DRY_RUN=true` after any profile change to validate payload shape.
