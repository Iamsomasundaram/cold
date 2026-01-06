# Cold Storage Architecture

This document describes the end-to-end system built around ingest, detection,
indexing, GenAI, and the dashboard. The docker compose entrypoint is
`ingest-api/docker-compose.kafka.yml`.

For C4-style diagrams, see `ingest-api/architecture.c4.md`.

## High-level flow

1) k6 simulator sends JSON events to ingest-api.
2) ingest-api publishes events to Kafka (`events.ingest.v1`).
3) detector consumes ingest events, writes readings/violations to
   Postgres, and emits detected events to Kafka (`events.detected.v1`).
4) indexer consumes detected events and indexes them into Elasticsearch.
5) notification consumes detected events and sends alerts (Slack/Email/SMS/WhatsApp),
   with rules + delivery logs stored in MongoDB.
6) genai queries Elasticsearch (and Postgres) to answer questions.
7) dashboard-api reads Postgres + Elasticsearch and exposes HTTP + WebSocket
   APIs for the dashboard UI.

```
k6 -> ingest-api -> Kafka (events.ingest.v1)
                 -> detector -> Postgres
                            -> Kafka (events.detected.v1)
                            -> indexer -> Elasticsearch
                                       -> notification -> MongoDB
                                       -> genai
                                       -> dashboard-api
dashboard-ui <-> dashboard-api (HTTP + WS)
```

## Services

Core data pipeline:
- ingest-api: HTTP entrypoint; validates and publishes events to Kafka.
- detector: consumes ingest events, evaluates rules, writes to Postgres,
  and emits detected events (JSON by default; Avro optional).
- indexer: consumes detected events and indexes into Elasticsearch.
- notification: consumes detected events, applies per-tenant rules, and sends alerts.
- genai: FastAPI service that answers questions using ES + Postgres.

Dashboard:
- dashboard-api: NestJS API that aggregates ES data and proxies GenAI requests.
- dashboard-ui: React UI served by Nginx (static assets).

Infra and observability:
- kafka + schema-registry
- postgres (Postgres)
- mongo + mongo-express
- elasticsearch + kibana
- prometheus + loki + promtail + grafana
- kafka-ui + pgadmin

## Event contracts

Ingest event (JSON):
- tenant_key, event_id, sensor_code, metric, value, unit, observed_at
- scenario, data_profile
- correlation_id, trace_id, tags, raw_payload (optional)

Detected event (JSON default):
- tenant_key, event_id, reading_id, violation_id
- sensor_code, metric, value, unit
- observed_at (epoch millis), detected_at (epoch millis)
- has_violation, severity, violation_type
- expected_min, expected_max, rule_version
- scenario, data_profile, correlation_id, trace_id, tags
- location: site_name, zone, rack

## Kafka topics
- events.ingest.v1 (ingest -> detector)
- events.detected.v1 (detector -> indexer)
- events.ingest.dlq.v1 (detector DLQ)
- events.detected.dlq.v1 (indexer DLQ)
- events.notifications.v1 (notification delivery outcomes)

## Storage
- Postgres: tenants, sensors, locations, sensor_readings, sensor_violations,
  rules and thresholds (schema_v2.sql).
- Elasticsearch: index `coldstore-detected-events` for detected events.

## Observability
- All services expose `/health` and `/metrics` where applicable.
- Prometheus scrapes metrics and Grafana visualizes them.
- Loki + Promtail collect logs.

## Ports (host)
See `ingest-api/compose-ports.md` for the full port table. Key custom services:
- ingest-api: 8088
- detector: 4001
- indexer: 4002
- notification: 4003
- genai: 4100
- dashboard-api: 4200
- dashboard-ui: 4300

## Local usage notes
- k6 targets ingest-api at `http://localhost:8088/api/v1/events`.
- dashboard-ui uses dashboard-api HTTP + WebSocket endpoints.
