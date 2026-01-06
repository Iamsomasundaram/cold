-- db/schema.sql (v2) — multi-tenant, hierarchical locations, scoped rules, facts + derived alerts
-- Works well for: k6 -> ingest-api -> Kafka -> detector-service -> Postgres

BEGIN;

-- UUID support (keep what you already use)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------
-- 0) Helper: updated_at trigger
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- 1) Tenants
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant (
  tenant_id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_key  TEXT NOT NULL UNIQUE,          -- human-friendly key (e.g., "acme", "potato-warehouse-01")
  name        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE / SUSPENDED / DELETED
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_tenant_updated_at ON tenant;
CREATE TRIGGER trg_tenant_updated_at
BEFORE UPDATE ON tenant
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- 2) Locations (hierarchical: facility -> chamber -> zone -> rack)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS location (
  id                 BIGSERIAL PRIMARY KEY,
  tenant_id           UUID NOT NULL REFERENCES tenant(tenant_id) ON DELETE CASCADE,

  location_type       TEXT NOT NULL,  -- FACILITY / CHAMBER / ZONE / RACK (you can extend)
  name                TEXT NOT NULL,  -- display name for this node
  parent_location_id  BIGINT NULL,    -- hierarchy link (within same tenant)

  -- optional legacy fields if you still like them for reporting/search
  site_name           TEXT,
  zone                TEXT,
  rack                TEXT,

  metadata            JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- allow composite FKs from child tables to enforce same-tenant references
  CONSTRAINT uq_location_tenant_id_id UNIQUE (tenant_id, id),

  -- enforce parent is within same tenant (composite FK)
  CONSTRAINT fk_location_parent_same_tenant
    FOREIGN KEY (tenant_id, parent_location_id)
    REFERENCES location(tenant_id, id)
    ON DELETE CASCADE
);

-- de-dup nodes under same parent within a tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_location_siblings
  ON location(tenant_id, parent_location_id, location_type, name);

CREATE INDEX IF NOT EXISTS idx_location_tenant_parent
  ON location(tenant_id, parent_location_id);

CREATE INDEX IF NOT EXISTS idx_location_type
  ON location(tenant_id, location_type);

DROP TRIGGER IF EXISTS trg_location_updated_at ON location;
CREATE TRIGGER trg_location_updated_at
BEFORE UPDATE ON location
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- 3) Sensors
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sensor (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenant(tenant_id) ON DELETE CASCADE,

  sensor_code TEXT NOT NULL,                 -- used in events
  sensor_type TEXT NOT NULL,                 -- TEMP / HUMIDITY / CO2 / DOOR / etc.
  location_id BIGINT NULL,

  status      TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE / INACTIVE / RETIRED
  metadata    JSONB,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_sensor_tenant_code UNIQUE (tenant_id, sensor_code),
  CONSTRAINT uq_sensor_tenant_id_id UNIQUE (tenant_id, id),

  CONSTRAINT fk_sensor_location_same_tenant
    FOREIGN KEY (tenant_id, location_id)
    REFERENCES location(tenant_id, id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sensor_tenant_location
  ON sensor(tenant_id, location_id);

CREATE INDEX IF NOT EXISTS idx_sensor_tenant_type
  ON sensor(tenant_id, sensor_type);

DROP TRIGGER IF EXISTS trg_sensor_updated_at ON sensor;
CREATE TRIGGER trg_sensor_updated_at
BEFORE UPDATE ON sensor
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- 4) Threshold Rules (scoped + versioned)
--    Scope priority (typical evaluation order):
--      SENSOR (most specific) > LOCATION > SENSOR_TYPE > TENANT (least)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS threshold_rule (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id        UUID NOT NULL REFERENCES tenant(tenant_id) ON DELETE CASCADE,

  scope           TEXT NOT NULL,   -- TENANT / LOCATION / SENSOR_TYPE / SENSOR
  metric          TEXT NOT NULL,   -- temperature / humidity / co2 / door_open_seconds / etc.

  min_value       DOUBLE PRECISION,
  max_value       DOUBLE PRECISION,

  warning_margin  DOUBLE PRECISION,
  critical_margin DOUBLE PRECISION,

  rule_version    TEXT NOT NULL DEFAULT 'v1',
  priority        INTEGER NOT NULL DEFAULT 100, -- higher wins if multiple match (you may rarely need this)
  active          BOOLEAN NOT NULL DEFAULT TRUE,

  effective_from  TIMESTAMPTZ,
  effective_to    TIMESTAMPTZ,

  -- scope targets (only one of these is used depending on scope)
  location_id     BIGINT NULL,
  sensor_id       BIGINT NULL,
  sensor_type     TEXT NULL,

  metadata        JSONB,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_threshold_rule_tenant_id_id UNIQUE (tenant_id, id),

  -- Same-tenant references
  CONSTRAINT fk_rule_location_same_tenant
    FOREIGN KEY (tenant_id, location_id)
    REFERENCES location(tenant_id, id)
    ON DELETE CASCADE,

  CONSTRAINT fk_rule_sensor_same_tenant
    FOREIGN KEY (tenant_id, sensor_id)
    REFERENCES sensor(tenant_id, id)
    ON DELETE CASCADE,

  -- Scope integrity
  CONSTRAINT ck_rule_scope_fields CHECK (
    (scope = 'TENANT'      AND location_id IS NULL AND sensor_id IS NULL AND sensor_type IS NULL) OR
    (scope = 'LOCATION'    AND location_id IS NOT NULL AND sensor_id IS NULL AND sensor_type IS NULL) OR
    (scope = 'SENSOR_TYPE' AND location_id IS NULL AND sensor_id IS NULL AND sensor_type IS NOT NULL) OR
    (scope = 'SENSOR'      AND location_id IS NULL AND sensor_id IS NOT NULL AND sensor_type IS NULL)
  ),

  -- Ensure min <= max when both provided
  CONSTRAINT ck_rule_min_max CHECK (
    min_value IS NULL OR max_value IS NULL OR min_value <= max_value
  )
);

-- One ACTIVE rule per (scope target, metric) — enforced per-scope via partial unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS uq_rule_active_tenant_metric
  ON threshold_rule(tenant_id, metric)
  WHERE active = TRUE AND scope = 'TENANT';

CREATE UNIQUE INDEX IF NOT EXISTS uq_rule_active_location_metric
  ON threshold_rule(tenant_id, location_id, metric)
  WHERE active = TRUE AND scope = 'LOCATION';

CREATE UNIQUE INDEX IF NOT EXISTS uq_rule_active_sensor_type_metric
  ON threshold_rule(tenant_id, sensor_type, metric)
  WHERE active = TRUE AND scope = 'SENSOR_TYPE';

CREATE UNIQUE INDEX IF NOT EXISTS uq_rule_active_sensor_metric
  ON threshold_rule(tenant_id, sensor_id, metric)
  WHERE active = TRUE AND scope = 'SENSOR';

CREATE INDEX IF NOT EXISTS idx_rule_lookup
  ON threshold_rule(tenant_id, scope, metric, active, priority DESC);

DROP TRIGGER IF EXISTS trg_threshold_rule_updated_at ON threshold_rule;
CREATE TRIGGER trg_threshold_rule_updated_at
BEFORE UPDATE ON threshold_rule
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- 5) Sensor Readings (canonical facts)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sensor_reading (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id      UUID NOT NULL REFERENCES tenant(tenant_id) ON DELETE CASCADE,

  event_id       TEXT NOT NULL,   -- idempotency key (from k6/ingest/kafka)
  sensor_id      BIGINT NULL,
  sensor_code    TEXT NOT NULL,   -- keep even if sensor_id exists (debuggable, avoids join)
  metric         TEXT NOT NULL,
  value          DOUBLE PRECISION NOT NULL,
  unit           TEXT NOT NULL,

  observed_at    TIMESTAMPTZ NOT NULL,
  ingested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Kafka lineage (optional but very useful)
  kafka_topic     TEXT,
  kafka_partition INTEGER,
  kafka_offset    BIGINT,

  correlation_id  TEXT,
  trace_id        TEXT,
  scenario        TEXT,
  data_profile    TEXT,
  tags            JSONB,

  raw_payload     JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_sensor_reading_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_sensor_reading_event UNIQUE (tenant_id, event_id),

  CONSTRAINT fk_reading_sensor_same_tenant
    FOREIGN KEY (tenant_id, sensor_id)
    REFERENCES sensor(tenant_id, id)
    ON DELETE SET NULL
);

-- Hot query patterns
CREATE INDEX IF NOT EXISTS idx_reading_sensor_metric_time
  ON sensor_reading(tenant_id, sensor_code, metric, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_reading_time_tenant
  ON sensor_reading(tenant_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_reading_sensorid_metric_time
  ON sensor_reading(tenant_id, sensor_id, metric, observed_at DESC);

-- ------------------------------------------------------------
-- 6) Violations / Alerts (derived from readings + rules)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sensor_violation (
  id             BIGSERIAL PRIMARY KEY,
  tenant_id       UUID NOT NULL REFERENCES tenant(tenant_id) ON DELETE CASCADE,

  reading_id      BIGINT NOT NULL,
  rule_id         BIGINT NULL,

  violation_type  TEXT NOT NULL,    -- HIGH_TEMP / LOW_TEMP / HIGH_CO2 / DOOR_OPEN_TOO_LONG / ...
  severity        TEXT NOT NULL,    -- INFO / WARN / CRITICAL

  expected_min    DOUBLE PRECISION,
  expected_max    DOUBLE PRECISION,
  actual_value    DOUBLE PRECISION NOT NULL,

  status          TEXT NOT NULL DEFAULT 'OPEN', -- OPEN / ACKED / CLOSED / SUPPRESSED
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  acked_by        TEXT,
  acked_at        TIMESTAMPTZ,
  closed_by       TEXT,
  closed_at       TIMESTAMPTZ,
  notes           TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT ck_violation_severity CHECK (severity IN ('INFO','WARN','CRITICAL')),
  CONSTRAINT ck_violation_status   CHECK (status IN ('OPEN','ACKED','CLOSED','SUPPRESSED')),

  -- Same-tenant references
  CONSTRAINT fk_violation_reading_same_tenant
    FOREIGN KEY (tenant_id, reading_id)
    REFERENCES sensor_reading(tenant_id, id)
    ON DELETE CASCADE,

  CONSTRAINT fk_violation_rule_same_tenant
    FOREIGN KEY (tenant_id, rule_id)
    REFERENCES threshold_rule(tenant_id, id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_violation_severity_time
  ON sensor_violation(tenant_id, severity, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_violation_status_time
  ON sensor_violation(tenant_id, status, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_violation_reading
  ON sensor_violation(tenant_id, reading_id);

-- ------------------------------------------------------------
-- 7) Dead-letter events (parse/validation failures)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dead_letter_event (
  id             BIGSERIAL PRIMARY KEY,
  tenant_id       UUID NULL REFERENCES tenant(tenant_id) ON DELETE SET NULL,

  event_id        TEXT,
  source          TEXT NOT NULL,  -- ingest-api / detector-service / etc.

  error_type      TEXT NOT NULL,  -- VALIDATION_ERROR / UNKNOWN_SENSOR / SCHEMA_MISMATCH / ...
  error_message   TEXT,

  kafka_topic     TEXT,
  kafka_partition INTEGER,
  kafka_offset    BIGINT,

  raw_payload     JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dle_created
  ON dead_letter_event(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dle_tenant_created
  ON dead_letter_event(tenant_id, created_at DESC);

-- ------------------------------------------------------------
-- Seed examples (optional) — keep commented for real envs
-- ------------------------------------------------------------
-- -- 1) Create a tenant
-- INSERT INTO tenant (tenant_key, name) VALUES ('demo', 'Demo Tenant')
-- ON CONFLICT (tenant_key) DO NOTHING;
--
-- -- 2) Create a facility + chamber under it
-- WITH t AS (
--   SELECT tenant_id FROM tenant WHERE tenant_key = 'demo'
-- ),
-- facility AS (
--   INSERT INTO location (tenant_id, location_type, name, site_name)
--   SELECT t.tenant_id, 'FACILITY', 'Potato Warehouse A', 'Warehouse-A' FROM t
--   ON CONFLICT (tenant_id, parent_location_id, location_type, name) DO NOTHING
--   RETURNING tenant_id, id
-- )
-- INSERT INTO location (tenant_id, location_type, name, parent_location_id)
-- SELECT facility.tenant_id, 'CHAMBER', 'Chamber-01', facility.id FROM facility
-- ON CONFLICT (tenant_id, parent_location_id, location_type, name) DO NOTHING;
--
-- -- 3) Create a sensor in Chamber-01
-- WITH t AS (
--   SELECT tenant_id FROM tenant WHERE tenant_key = 'demo'
-- ),
-- chamber AS (
--   SELECT l.tenant_id, l.id
--   FROM location l
--   JOIN t ON t.tenant_id = l.tenant_id
--   WHERE l.location_type = 'CHAMBER' AND l.name = 'Chamber-01'
-- )
-- INSERT INTO sensor (tenant_id, sensor_code, sensor_type, location_id)
-- SELECT chamber.tenant_id, 'SENSOR-001', 'TEMP', chamber.id FROM chamber
-- ON CONFLICT (tenant_id, sensor_code) DO NOTHING;
--
-- -- 4) Tenant-level default rule for temperature
-- WITH t AS (SELECT tenant_id FROM tenant WHERE tenant_key = 'demo')
-- INSERT INTO threshold_rule (tenant_id, scope, metric, min_value, max_value, warning_margin, critical_margin, rule_version, active)
-- SELECT tenant_id, 'TENANT', 'temperature', 2.0, 8.0, 1.0, 2.0, 'v1', TRUE FROM t
-- ON CONFLICT DO NOTHING;

COMMIT;
