# Cold Storage Architecture (C4)

This file provides C4-style diagrams in Mermaid. Use a Markdown viewer that
supports Mermaid C4 (e.g., Mermaid 10+ or compatible VS Code extensions).

## C4 Context

```mermaid
C4Context
title Cold Storage Platform - System Context

Person(ops, "Operator", "Monitors violations and requests GenAI insights")
System_Ext(k6, "k6 Simulator", "Generates synthetic telemetry events")
System_Ext(kafka, "Kafka", "Event streaming platform")
System_Ext(pg, "Postgres", "Stores sensor readings, rules, violations")
System_Ext(es, "Elasticsearch", "Indexes detected events for search")
System_Ext(mongo, "MongoDB", "Stores notification rules and delivery logs")
System_Ext(openai, "OpenAI", "LLM provider used by genai")

System_Boundary(cold, "Cold Storage Platform") {
  System(coldstack, "Cold Storage Services", "Ingest, detect, index, GenAI, and dashboard")
}

Rel(ops, coldstack, "Uses dashboard and GenAI")
Rel(k6, coldstack, "Sends telemetry events")
Rel(coldstack, kafka, "Publishes and consumes events")
Rel(coldstack, pg, "Reads and writes")
Rel(coldstack, es, "Indexes and queries")
Rel(coldstack, mongo, "Reads and writes")
Rel(coldstack, openai, "Generates LLM responses")
```

## C4 Container

```mermaid
C4Container
title Cold Storage Platform - Container Diagram

Person(ops, "Operator", "Monitors operations")
Container_Ext(k6, "k6 Simulator", "k6", "Load profiles and data profiles")

System_Boundary(cold, "Cold Storage Platform") {
  Container(ingest, "ingest-api", "Node.js", "HTTP ingest, validation, Kafka publish")
  Container(detector, "detector", "Node.js", "Rules, DB writes, detected events")
  Container(indexer, "indexer", "Node.js", "Indexes detected events into ES")
  Container(notification, "notification", "NestJS", "Alert routing + delivery logs")
  Container(genai, "genai", "FastAPI", "GenAI insights using ES/PG")
  Container(dashApi, "dashboard-api", "NestJS", "Aggregations + GenAI proxy")
  Container(dashUi, "dashboard-ui", "React", "Operations dashboard UI")
}

ContainerQueue(kafka, "Kafka", "Kafka", "events.ingest.v1, events.detected.v1, events.notifications.v1")
ContainerDb(pg, "Postgres", "PostgreSQL", "Readings, rules, violations")
ContainerDb(es, "Elasticsearch", "Elasticsearch", "Detected event index")
ContainerDb(mongoDb, "MongoDB", "MongoDB", "Notification rules + deliveries")

Container_Ext(prom, "Prometheus", "Prometheus", "Scrapes /metrics")
Container_Ext(grafana, "Grafana", "Grafana", "Dashboards")
Container_Ext(loki, "Loki", "Loki", "Log aggregation")
Container_Ext(openai, "OpenAI", "LLM API", "Model inference")

Rel(k6, ingest, "POST /api/v1/events", "JSON")
Rel(ingest, kafka, "Produce", "events.ingest.v1")
Rel(kafka, detector, "Consume", "events.ingest.v1")
Rel(detector, pg, "Write", "readings + violations")
Rel(detector, kafka, "Produce", "events.detected.v1")
Rel(kafka, indexer, "Consume", "events.detected.v1")
Rel(kafka, notification, "Consume", "events.detected.v1")
Rel(notification, kafka, "Produce", "events.notifications.v1")
Rel(indexer, es, "Index", "coldstore-detected-events")
Rel(notification, mongoDb, "Read/write", "rules + deliveries")
Rel(genai, es, "Query", "violations")
Rel(genai, pg, "Query", "thresholds and context")
Rel(genai, openai, "Completion", "LLM response")
Rel(dashApi, pg, "Query", "tenants, sensors")
Rel(dashApi, es, "Query", "aggregations")
Rel(dashApi, genai, "Proxy", "/genai/insights")
Rel(dashUi, dashApi, "HTTP + WS", "summary, violations, time series")
Rel(ops, dashUi, "Uses", "monitoring and GenAI")
Rel(dashApi, prom, "Expose /metrics")
Rel(ingest, prom, "Expose /metrics")
Rel(detector, prom, "Expose /metrics")
Rel(indexer, prom, "Expose /metrics")
Rel(genai, prom, "Expose /metrics")
Rel(prom, grafana, "Data source")
Rel(prom, loki, "Scrape logs via Promtail")
```
