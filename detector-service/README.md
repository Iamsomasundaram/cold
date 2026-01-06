# detector-service

Kafka consumer that evaluates ingest events against rules and emits detected
events. Writes violations to Postgres and publishes to `events.detected.v1`.

## Endpoints
- `GET /health` -> DB connectivity check
- `GET /metrics` -> Prometheus metrics

## Inputs and outputs
- Consumes: `events.ingest.v1`
- Produces: `events.detected.v1` (JSON by default, Avro optional)
- DLQ: `events.ingest.dlq.v1`

Detected encoding is controlled by `DETECTED_ENCODING` (`json` or `avro`).

## Environment variables
- `SERVICE_NAME` (default: `detector-service`)
- `NODE_ENV` (default: `development`)
- `PORT` (default: 4001)
- `LOG_LEVEL` (default: `info`)
- `KAFKA_BROKERS` (default: `localhost:9092`)
- `KAFKA_CLIENT_ID` (default: `detector-service`)
- `KAFKA_GROUP_ID` (default: `coldstore-detector-v1`)
- `INGEST_TOPIC` (default: `events.ingest.v1`)
- `DETECTED_TOPIC` (default: `events.detected.v1`)
- `DLQ_TOPIC` (default: `events.ingest.dlq.v1`)
- `SCHEMA_REGISTRY_URL` (default: `http://localhost:8081`)
- `DETECTED_ENCODING` (default: `json`)
- `PG_HOST` (default: `localhost`)
- `PG_PORT` (default: 5432)
- `PG_DATABASE` (default: `coldstore`)
- `PG_USER` (default: `coldstore`)
- `PG_PASSWORD` (default: `coldstore`)
- `PG_SSL` (`true` or `false`, default: `false`)

## Schema
Active DB schema: `detector-service/db/schema_v2.sql`.

## Run locally
```powershell
npm install
npm run dev
```

## Docker
Use `ingest-api/docker-compose.kafka.yml`. The service runs on port 4001.
