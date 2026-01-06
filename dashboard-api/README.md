# dashboard-api

NestJS API that powers the dashboard. It reads tenants/sensors from Postgres,
aggregates violations from Elasticsearch, and proxies requests to genai.

## Endpoints
- `GET /health`
- `GET /api/tenants`
- `GET /api/sensors?tenant_key=...`
- `GET /api/summary`
- `GET /api/violations`
- `GET /api/timeseries`
- `POST /api/genai/insights`
- `WS /ws` (pushes summary + recent violations)

## Auth
All `/api/*` routes require `x-api-token` or `Authorization: Bearer ...`
unless `API_TOKEN` is empty. WebSocket accepts `?token=...` or headers.

## Environment variables
- `NODE_ENV` (default: `development`)
- `PORT` (default: 4200)
- `PG_HOST` (default: `localhost`)
- `PG_PORT` (default: 5432)
- `PG_DB` (default: `coldstore`)
- `PG_USER` (default: `coldstore`)
- `PG_PASSWORD` (default: `coldstore`)
- `ES_URL` (default: `http://localhost:9200`)
- `ES_INDEX` (default: `coldstore-detected-events`)
- `GENAI_URL` (default: `http://localhost:4100`)
- `GENAI_TIMEOUT_MS` (default: 30000)
- `API_TOKEN` (default: `dev-token`)
- `DEFAULT_TENANT_KEY` (default: `potato_wh`)
- `DEFAULT_TIME_WINDOW_MINUTES` (default: 120)
- `WS_PUSH_INTERVAL_MS` (default: 5000)

## Run locally
```powershell
npm install
npm run build
npm start
```

Dev mode:
```powershell
npm run start:dev
```

## Docker
Use `ingest-api/docker-compose.kafka.yml`. The service runs on port 4200.
