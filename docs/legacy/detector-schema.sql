-- db/schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Locations (optional but useful for metadata)
CREATE TABLE IF NOT EXISTS location (
    id          SERIAL PRIMARY KEY,
    site_name   TEXT NOT NULL,
    zone        TEXT,
    rack        TEXT,
    metadata    JSONB,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Sensors
CREATE TABLE IF NOT EXISTS sensor (
    id           SERIAL PRIMARY KEY,
    sensor_code  TEXT NOT NULL UNIQUE, -- used in events
    type         TEXT NOT NULL,        -- e.g. TEMP, HUMIDITY, DOOR
    location_id  INTEGER REFERENCES location(id),
    status       TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sensor_location
    ON sensor(location_id);

-- Threshold rules per (sensor_code, metric)
CREATE TABLE IF NOT EXISTS sensor_threshold (
    id              SERIAL PRIMARY KEY,
    sensor_code     TEXT NOT NULL,
    metric          TEXT NOT NULL,    -- e.g. temperature, humidity
    min_value       DOUBLE PRECISION NOT NULL,
    max_value       DOUBLE PRECISION NOT NULL,
    warning_margin  DOUBLE PRECISION,
    critical_margin DOUBLE PRECISION,
    rule_version    TEXT NOT NULL DEFAULT 'v1',
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_sensor_threshold UNIQUE (sensor_code, metric, active)
);

CREATE INDEX IF NOT EXISTS idx_sensor_threshold_sensor_metric
    ON sensor_threshold(sensor_code, metric)
    WHERE active = TRUE;

-- Readings (canonical facts)
CREATE TABLE IF NOT EXISTS sensor_reading (
    id           BIGSERIAL PRIMARY KEY,
    event_id     TEXT NOT NULL UNIQUE,       -- idempotency key from Kafka
    sensor_code  TEXT NOT NULL,
    metric       TEXT NOT NULL,
    value        DOUBLE PRECISION NOT NULL,
    unit         TEXT NOT NULL,
    observed_at  TIMESTAMPTZ NOT NULL,
    ingested_at  TIMESTAMPTZ NOT NULL,
    raw_payload  JSONB,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sensor_reading_sensor_metric_time
    ON sensor_reading(sensor_code, metric, observed_at DESC);

-- Violations (derived events / alerts)
CREATE TABLE IF NOT EXISTS sensor_violation (
    id            BIGSERIAL PRIMARY KEY,
    reading_id    BIGINT NOT NULL REFERENCES sensor_reading(id),
    violation_type TEXT NOT NULL,           -- HIGH_TEMP, LOW_TEMP, TEMP_AND_HUMIDITY, ...
    severity      TEXT NOT NULL,            -- INFO, WARN, CRITICAL
    expected_min  DOUBLE PRECISION,
    expected_max  DOUBLE PRECISION,
    actual_value  DOUBLE PRECISION NOT NULL,
    rule_version  TEXT,
    status        TEXT NOT NULL DEFAULT 'OPEN', -- future use (ACKED/CLOSED)
    detected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sensor_violation_reading
    ON sensor_violation(reading_id);

CREATE INDEX IF NOT EXISTS idx_sensor_violation_severity_time
    ON sensor_violation(severity, detected_at DESC);

-- Simple seed threshold example
INSERT INTO sensor_threshold (sensor_code, metric, min_value, max_value, warning_margin, critical_margin, rule_version, active)
VALUES ('SENSOR-001', 'temperature', 2.0, 8.0, 1.0, 2.0, 'v1', TRUE)
ON CONFLICT DO NOTHING;
