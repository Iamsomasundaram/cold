# Integration Runbook

This runbook covers starting the stack, quick sanity checks, and k6 load runs
(5,000 events per run). All commands are PowerShell-friendly.

## 1) Start the full cluster

```powershell
docker compose -f ingest-api\docker-compose.kafka.yml up -d --build
```

## 2) Quick sanity checks

Browser checks:
- Dashboard UI: http://localhost:4300
- Kafka UI: http://localhost:8080
- Elasticsearch: http://localhost:9200
- Kibana: http://localhost:5601
- Grafana: http://localhost:3000
- PgAdmin: http://localhost:5050
- Mongo Express: http://localhost:8082

API checks:
```powershell
Invoke-RestMethod http://localhost:4200/health        # dashboard-api
Invoke-RestMethod http://localhost:8088/metrics       # ingest-api (no /health endpoint)
Invoke-RestMethod http://localhost:4001/health        # detector
Invoke-RestMethod http://localhost:4002/health        # indexer
Invoke-RestMethod http://localhost:4100/health        # genai
```

## 3) k6 runs (5,000 events per run)

Note: When k6 runs inside Docker, it must call the host via
`http://host.docker.internal:8088`.

```powershell
$work = (Get-Location).Path
$base = "http://host.docker.internal:8088"
$eps = 50
$duration = 100  # 50 EPS * 100s = 5,000 events
```

### Baseline success (LP1 + DP1)
```powershell
docker run --rm `
  -e K6_CONFIG="k6_profiles.v1.json" `
  -e LOAD_PROFILE="LP1" `
  -e DATA_PROFILE="DP1" `
  -e TENANT_MODE="single" `
  -e TENANT_KEY="potato_wh" `
  -e ENDPOINT_BASE_URL="$base" `
  -e ENDPOINT_PATH="/api/v1/events" `
  -e DURATION_SECONDS="$duration" `
  -e EVENTS_PER_SECOND="$eps" `
  -v "$work\simulator\k6:/work" `
  -w /work `
  grafana/k6 run steady_traffic.js
```

### Violations (LP1 + DP2)
```powershell
docker run --rm `
  -e K6_CONFIG="k6_profiles.v1.json" `
  -e LOAD_PROFILE="LP1" `
  -e DATA_PROFILE="DP2" `
  -e TENANT_MODE="single" `
  -e TENANT_KEY="potato_wh" `
  -e ENDPOINT_BASE_URL="$base" `
  -e ENDPOINT_PATH="/api/v1/events" `
  -e DURATION_SECONDS="$duration" `
  -e EVENTS_PER_SECOND="$eps" `
  -v "$work\simulator\k6:/work" `
  -w /work `
  grafana/k6 run steady_traffic.js
```

### Fault injection (LP1 + DP5)
```powershell
docker run --rm `
  -e K6_CONFIG="k6_profiles.v1.json" `
  -e LOAD_PROFILE="LP1" `
  -e DATA_PROFILE="DP5" `
  -e TENANT_MODE="single" `
  -e TENANT_KEY="potato_wh" `
  -e ENDPOINT_BASE_URL="$base" `
  -e ENDPOINT_PATH="/api/v1/events" `
  -e DURATION_SECONDS="$duration" `
  -e EVENTS_PER_SECOND="$eps" `
  -v "$work\simulator\k6:/work" `
  -w /work `
  grafana/k6 run steady_traffic.js
```

## 4) Optional smoke test (10 events)

```powershell
$work = (Get-Location).Path

docker run --rm `
  -e K6_CONFIG="k6_profiles.v1.json" `
  -e LOAD_PROFILE="LP1" `
  -e DATA_PROFILE="DP1" `
  -e TENANT_MODE="single" `
  -e TENANT_KEY="potato_wh" `
  -e ENDPOINT_BASE_URL="http://host.docker.internal:8088" `
  -e ENDPOINT_PATH="/api/v1/events" `
  -e DURATION_SECONDS="10" `
  -e EVENTS_PER_SECOND="1" `
  -v "$work\simulator\k6:/work" `
  -w /work `
  grafana/k6 run steady_traffic.js
```
