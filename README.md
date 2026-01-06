# Cold Storage Platform

End-to-end cold storage telemetry pipeline with ingest, detection, indexing,
dashboard, GenAI insights, and notifications, plus a k6 simulator and full
observability stack.

## Prerequisites
- Git
- Docker Desktop (includes Docker Compose v2)
- Optional for local dev (outside Docker):
  - Node.js 20+ (services: ingest-api, detector, indexer, dashboard-api/ui, notification)
  - Python 3.11+ (genai-service)

## Clone the repo
```bash
git clone <your-repo-url>
cd cold
```

## Configure environment
Each service ships a `.env.example`. Copy and adjust as needed:
- `ingest-api/.env.example`
- `detector-service/.env.example`
- `indexer-service/.env.example`
- `genai-service/.env.example`
- `dashboard-api/.env.example`
- `dashboard-ui/.env.example`
- `notification-service/.env.example`
- `simulator/k6/.env.example`

For a Docker-first setup, copy `ingest-api/.env.example` to `ingest-api/.env`
to provide secrets used by `ingest-api/docker-compose.kafka.yml`.

## Start the stack (Docker)
From the repo root:
```bash
docker compose -f ingest-api/docker-compose.kafka.yml up -d --build
```

Useful entry points (default ports):
- Dashboard UI: http://localhost:4300
- Dashboard API: http://localhost:4200
- Ingest API: http://localhost:8088
- GenAI API: http://localhost:4100
- Notification API: http://localhost:4003
- Kafka UI: http://localhost:8080
- Kibana: http://localhost:5601
- Grafana: http://localhost:3000
- PgAdmin: http://localhost:5050
- Mongo Express: http://localhost:8082

See `ingest-api/compose-ports.md` for the full port map.

## Run k6 simulator (Docker)
```bash
docker run --rm \
  -e K6_CONFIG="k6_profiles.v1.json" \
  -e LOAD_PROFILE="LP1" \
  -e DATA_PROFILE="DP1" \
  -e TENANT_MODE="single" \
  -e TENANT_KEY="potato_wh" \
  -e ENDPOINT_BASE_URL="http://localhost:8088" \
  -e ENDPOINT_PATH="/api/v1/events" \
  -v "$PWD/simulator/k6:/work" \
  -w /work \
  grafana/k6 run steady_traffic.js
```

For DRY_RUN payload previews:
```bash
docker run --rm \
  -e K6_CONFIG="k6_profiles.v1.json" \
  -e DATA_PROFILE="DP2" \
  -e TENANT_MODE="single" \
  -e TENANT_KEY="potato_wh" \
  -e DRY_RUN="true" \
  -e DRY_RUN_SAMPLES="5" \
  -v "$PWD/simulator/k6:/work" \
  -w /work \
  grafana/k6 run steady_traffic.js
```

## Stop the stack
```bash
docker compose -f ingest-api/docker-compose.kafka.yml down
```

## Service docs
Each service has its own README for deeper details:
- `ingest-api/README.md`
- `detector-service/README.md`
- `indexer-service/README.md`
- `genai-service/README.md`
- `dashboard-api/README.md`
- `dashboard-ui/README.md`
- `notification-service/README.md`
