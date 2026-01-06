# indexer-service

Kafka consumer that indexes detected events into Elasticsearch. Accepts JSON
or Avro payloads and exposes health/metrics.

## Endpoints
- `GET /health`
- `GET /metrics`

## Inputs and outputs
- Consumes: `events.detected.v1`
- DLQ: `events.detected.dlq.v1`
- Index: `coldstore-detected-events` (default)

Detected payload decoding prefers JSON by default, honors `content-type` when
present, and can be overridden via `DETECTED_ENCODING` (`json`, `avro`,
or `auto`).

## Environment variables
- `SERVICE_NAME` (default: `indexer-service`)
- `NODE_ENV` (default: `development`)
- `PORT` (default: 4002)
- `LOG_LEVEL` (default: `info`)
- `KAFKA_BROKERS` (default: `localhost:9092`)
- `KAFKA_CLIENT_ID` (default: `indexer-service`)
- `KAFKA_GROUP_ID` (default: `coldstore-indexer-v1`)
- `DETECTED_TOPIC` (default: `events.detected.v1`)
- `INDEXER_DLQ_TOPIC` (default: `events.detected.dlq.v1`)
- `DETECTED_ENCODING` (default: `json`)
- `SCHEMA_REGISTRY_URL` (default: `http://localhost:8081`)
- `ES_NODE_URL` (default: `http://localhost:9200`)
- `ES_INDEX` (default: `coldstore-detected-events`)

## Run locally
```powershell
npm install
npm run dev
```

## Docker
Use `ingest-api/docker-compose.kafka.yml`. The service runs on port 4002.
