# ingest-api

HTTP ingest entrypoint for cold storage telemetry. Accepts JSON events and
queues them to Kafka (or an in-memory queue for local testing).

## Endpoints
- `POST /api/v1/events` -> accepts an event payload (202 on success)
- `GET /api/v1/metrics` -> JSON snapshot of metrics and queue stats
- `GET /metrics` -> Prometheus scrape endpoint

## Event payload
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
- `PORT` (default: 8080)
- `NODE_ENV` (default: `dev`)
- `LOG_LEVEL` (default: `info`)
- `QUEUE_BACKEND` (`kafka` or `memory`, default: `kafka`)
- `KAFKA_BROKERS` (default: `localhost:9092`)
- `KAFKA_CLIENT_ID` (default: `ingest-api`)
- `KAFKA_TOPIC_EVENTS` (default: `events.ingest.v1`)
- `INGEST_API_KEY` (if set, enables API key auth)
- `RATE_LIMIT_WINDOW_MS` (default: 60000)
- `RATE_LIMIT_MAX_REQUESTS` (default: 6000)
- `QUEUE_MEMORY_MAX_DEPTH` (default: 5000)
- `INGEST_SIMULATED_FAILURE_RATE` (default: 0)

## Run locally
```powershell
npm install
npm run dev
```

Build and run:
```powershell
npm run build
npm start
```

## Docker
Use `ingest-api/docker-compose.kafka.yml`. Port is mapped to `8088` in compose.
