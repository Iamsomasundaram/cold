// src/db.js
const { Pool } = require("pg");
const { config } = require("./config");
const { logger } = require("./logger");

const pool = new Pool(config.pg);

// Simple health-check helper
async function ping() {
  const res = await pool.query("SELECT 1 AS ok");
  return res.rows[0].ok === 1;
}

/**
 * Inserts a sensor reading and returns the inserted row (including id).
 * NOTE: In real life you’d probably use parameterized queries + a repo layer;
 * this is a simplified but safe version for now.
 */
async function insertSensorReading(reading) {
  const {
    eventId,
    tenantId,
    sensorId,
    sensorCode,
    metric,
    value,
    unit,
    observedAt,
    ingestedAt,
    correlationId,
    traceId,
    scenario,
    dataProfile,
    tags,
    rawPayload,
    kafkaTopic,
    kafkaPartition,
    kafkaOffset,
  } = reading;

  const query = `
    INSERT INTO sensor_reading (
      tenant_id,
      event_id,
      sensor_id,
      sensor_code,
      metric,
      value,
      unit,
      observed_at,
      ingested_at,
      correlation_id,
      trace_id,
      scenario,
      data_profile,
      tags,
      raw_payload,
      kafka_topic,
      kafka_partition,
      kafka_offset
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    ON CONFLICT (tenant_id, event_id) DO UPDATE
      SET value = EXCLUDED.value
    RETURNING id;
  `;

  const params = [
    tenantId,
    eventId,
    sensorId,
    sensorCode,
    metric,
    value,
    unit,
    observedAt,
    ingestedAt,
    correlationId,
    traceId,
    scenario,
    dataProfile,
    tags,
    rawPayload,
    kafkaTopic,
    kafkaPartition,
    kafkaOffset,
  ];

  const { rows } = await pool.query(query, params);
  return rows[0]; // { id: ... }
}

async function getTenantIdByKey(tenantKey) {
  const query = `
    SELECT tenant_id
    FROM tenant
    WHERE tenant_key = $1
    LIMIT 1;
  `;
  const { rows } = await pool.query(query, [tenantKey]);
  return rows[0] || null;
}

async function getSensorContext(tenantId, sensorCode) {
  const query = `
    SELECT
      s.id,
      s.sensor_type,
      s.location_id,
      l.site_name,
      l.zone,
      l.rack
    FROM sensor s
    LEFT JOIN location l
      ON l.tenant_id = s.tenant_id
     AND l.id = s.location_id
    WHERE s.tenant_id = $1
      AND s.sensor_code = $2
    LIMIT 1;
  `;
  const { rows } = await pool.query(query, [tenantId, sensorCode]);
  return rows[0] || null;
}

/**
 * Fetch threshold rule for a given sensor/metric.
 * For now we assume a "sensor_threshold" table keyed by sensor_code + metric.
 */
async function getThresholdFor(
  tenantId,
  sensorId,
  locationId,
  sensorType,
  metric
) {
  const query = `
    SELECT
      id,
      scope,
      metric,
      min_value,
      max_value,
      warning_margin,
      critical_margin,
      rule_version,
      priority
    FROM threshold_rule
    WHERE tenant_id = $1
      AND metric = $2
      AND active = TRUE
      AND (
        (scope = 'SENSOR' AND sensor_id = $3) OR
        (scope = 'LOCATION' AND location_id = $4) OR
        (scope = 'SENSOR_TYPE' AND sensor_type = $5) OR
        (scope = 'TENANT')
      )
    ORDER BY
      CASE scope
        WHEN 'SENSOR' THEN 4
        WHEN 'LOCATION' THEN 3
        WHEN 'SENSOR_TYPE' THEN 2
        WHEN 'TENANT' THEN 1
        ELSE 0
      END DESC,
      priority DESC
    LIMIT 1;
  `;
  const { rows } = await pool.query(query, [
    tenantId,
    metric,
    sensorId,
    locationId,
    sensorType,
  ]);
  return rows[0] || null;
}

/**
 * Insert a violation row.
 */
async function insertViolation(violation) {
  const {
    tenantId,
    readingId,
    ruleId,
    violationType,
    severity,
    expectedMin,
    expectedMax,
    actualValue,
  } = violation;

  const query = `
    INSERT INTO sensor_violation (
      tenant_id,
      reading_id,
      rule_id,
      violation_type,
      severity,
      expected_min,
      expected_max,
      actual_value,
      detected_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8, NOW())
    RETURNING id;
  `;

  const params = [
    tenantId,
    readingId,
    ruleId,
    violationType,
    severity,
    expectedMin,
    expectedMax,
    actualValue,
  ];

  const { rows } = await pool.query(query, params);
  return rows[0];
}

/**
 * Fetch N recent readings for a given sensor + metric, ordered by observed_at DESC.
 * Includes the current reading if already inserted.
 */
async function getRecentReadings(tenantId, sensorCode, metric, limit = 3) {
  const query = `
    SELECT id,
           sensor_code,
           metric,
           value,
           unit,
           observed_at
    FROM sensor_reading
    WHERE tenant_id = $1
      AND sensor_code = $2
      AND metric = $3
    ORDER BY observed_at DESC
    LIMIT $4;
  `;
  const { rows } = await pool.query(query, [
    tenantId,
    sensorCode,
    metric,
    limit,
  ]);
  return rows;
}

/**
 * Fetch latest reading for a sensor + metric (for simple multi-metric rules).
 */
async function getLatestReading(tenantId, sensorCode, metric) {
  const query = `
    SELECT id,
           sensor_code,
           metric,
           value,
           unit,
           observed_at
    FROM sensor_reading
    WHERE tenant_id = $1
      AND sensor_code = $2
      AND metric = $3
    ORDER BY observed_at DESC
    LIMIT 1;
  `;
  const { rows } = await pool.query(query, [tenantId, sensorCode, metric]);
  return rows[0] || null;
}

module.exports = {
  pool,
  ping,
  insertSensorReading,
  getTenantIdByKey,
  getSensorContext,
  getThresholdFor,
  insertViolation,
  getRecentReadings,
  getLatestReading,
};
