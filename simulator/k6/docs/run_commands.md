# Single-tenant (Option A)

```bash
k6 run steady_traffic.js `
 -e K6_CONFIG=./k6_profiles.v1.json `
 -e DATA_PROFILE=DP1 `
 -e TENANT_MODE=single `
 -e TENANT_KEY=potato_wh `
 -e RUN_LABEL=potato_baseline_lp1_dp1
```

```bash
k6 run busy_hour_traffic.js `
  -e K6_CONFIG=./k6_profiles.v1.json `
  -e DATA_PROFILE=DP2 `
  -e TENANT_MODE=single `
  -e TENANT_KEY=potato_wh `
  -e RUN_LABEL=potato_peak_violations_lp2_dp2
```

```bash
k6 run burst_traffic.js `
  -e K6_CONFIG=./k6_profiles.v1.json `
  -e DATA_PROFILE=DP5 `
  -e TENANT_MODE=single `
  -e TENANT_KEY=healthcare_fac `
  -e RUN_LABEL=hc_burst_chaos_lp3_dp5
```

# Weighted multi-tenant (Option B)

```bash
k6 run busy_hour_traffic.js `
  -e K6_CONFIG=./k6_profiles.v1.json `
  -e DATA_PROFILE=DP2 `
  -e TENANT_MODE=weighted `
  -e RUN_LABEL=weighted_peak_violations_lp2_dp2
```

```bash
k6 run burst_traffic.js `
  -e K6_CONFIG=./k6_profiles.v1.json `
  -e DATA_PROFILE=DP5 `
  -e TENANT_MODE=weighted `
  -e TENANT_DISTRIBUTION=90,10 `
  -e RUN_LABEL=weighted_skew90_10_lp3_dp5
```

# Quick sanity check (no traffic)

```bash
k6 run steady_traffic.js `
  -e K6_CONFIG=./k6_profiles.v1.json `
  -e DATA_PROFILE=DP3 `
  -e TENANT_MODE=single `
  -e TENANT_KEY=potato_wh `
  -e DRY_RUN=true
```

## This command works

```bash
  docker run --rm `
  -e K6_CONFIG="k6_profiles.v1.json" `
  -e DATA_PROFILE="DP3" `
  -e TENANT_MODE="single" `
  -e TENANT_KEY="potato_wh" `
  -e DRY_RUN="true" `
  -e EVENTS_PER_SECOND="1" `
  -e DURATION_SECONDS="10" `
  -e RUN_LABEL="potato_baseline_lp1_dp1_dryrun" `
  -v "D:\\Code\\Projects\\Projects\\playground\\cold\\simulator\\k6:/work" `
  -w /work `
  grafana/k6 `
  run steady_traffic.js
```

```bash
docker run --rm `
  -e K6_CONFIG="k6_profiles.v1.json" `
  -e DATA_PROFILE="DP3" `
  -e TENANT_MODE="single" `
  -e TENANT_KEY="potato_wh" `
  -e DRY_RUN="true" `
  -e DRY_RUN_SAMPLES="5" `
  -e EVENTS_PER_SECOND="1" `
  -e DURATION_SECONDS="10" `
  -e RUN_LABEL="potato_baseline_lp1_dp1_dryrun" `
  -v "D:\\Code\\Projects\\Projects\\playground\\cold\\simulator\\k6:/work" `
  -w /work `
  grafana/k6 `
  run steady_traffic.js

```

```bash
docker run --rm `
  -e K6_CONFIG="k6_profiles.v1.json" `
  -e DATA_PROFILE="DP3" `
  -e TENANT_MODE="single" `
  -e TENANT_KEY="potato_wh" `
  -e DRY_RUN="true" `
  -e DRY_RUN_PREVIEW_ALL_PHASES="true" `
  -e EVENTS_PER_SECOND="1" `
  -e DURATION_SECONDS="10" `
  -e RUN_LABEL="potato_baseline_lp1_dp3_dryrun" `
  -v "D:\Code\Projects\Projects\playground\cold\simulator\k6:/work" `
  -w /work `
  grafana/k6 `
  run steady_traffic.js

```
