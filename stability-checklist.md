# Stability Checklist

Use this as a short, focused hardening guide for the cold storage platform.

1) Secrets/config hygiene
- Remove hardcoded webhooks/API keys from compose.
- Use `.env` + `.env.example`; keep local secrets in `.gitignore`.
- Rotate test secrets after validation runs.

2) Contract enforcement
- Version JSON schemas for ingest/detected/notification events.
- Validate at ingest + detector; keep schema changes explicit.
- Add contract tests using k6 payload samples.

3) Kafka topic lifecycle
- Pre-create topics with intended partitions/retention.
- Maintain a single topic registry doc.
- Ensure producer/consumer partition expectations match.

4) Data stores/migrations
- Versioned PG + Mongo migrations and seed scripts.
- One reset script to drop volumes and reseed.
- Keep `schema_v2.sql` and `seed.sql` in lockstep.

5) Elasticsearch hygiene
- Index templates + aliases; define keyword fields for filters.
- Reindex script for mapping changes.
- Cleanup strategy for old indices.

6) Observability + test harness
- Consistent log fields: `tenant_key`, `correlation_id`, `trace_id`.
- Smoke tests per service (health + basic query).
- Short k6 sanity preset for every change.

## Industry-grade targets
1) Secrets/config cleanup + env management
2) Event schema versioning + contract tests
3) CI pipeline with lint/test/build + smoke tests
4) DB migrations + repeatable reset/reseed
5) ES templates/aliases + index lifecycle
6) Operational runbook + on-call alerts
