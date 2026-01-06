# notification-service

NestJS microservice that consumes detected events from Kafka and sends
notifications via Slack, SendGrid email, and Twilio SMS/WhatsApp. Rules and
delivery logs are stored in MongoDB.

## Endpoints
- `GET /health`
- `GET /api/rules`
- `POST /api/rules`
- `PUT /api/rules/:id`
- `DELETE /api/rules/:id`

## Behavior
- Consumes `events.detected.v1`.
- Emits `events.notifications.v1` (delivery outcomes).
- Notifies on WARN+ when `has_violation=true`.
- Throttles per tenant + sensor + severity using a configurable window.
- If a channel is not configured, logs a message and skips sending.
- Seeds default rules on startup (tenant-specific + global fallback).

## Environment variables
See `.env.example` (includes Kafka topics + channel tokens).

## Docker
Use `ingest-api/docker-compose.kafka.yml`. Service port is `4003`.
