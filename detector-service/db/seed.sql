-- db/seed.sql
BEGIN;

-- ------------------------------------------------------------
-- 1) Tenants (2)
-- ------------------------------------------------------------
INSERT INTO tenant (tenant_key, name, status, metadata)
VALUES
  ('potato_wh', 'GoldenSpud Potato Warehouse', 'ACTIVE',
   '{"industry":"agri-cold-storage","commodity":"potato","country":"IN"}'::jsonb),
  ('healthcare_fac', 'CareWell Health Network', 'ACTIVE',
   '{"industry":"healthcare","country":"IN"}'::jsonb)
ON CONFLICT (tenant_key)
DO UPDATE SET
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  metadata = EXCLUDED.metadata;

-- ------------------------------------------------------------
-- 2) Locations
--    Potato Warehouse: 3 locations (Facility + 2 Chambers)
--    Healthcare: 2 locations (Facility + ICU zone)
-- ------------------------------------------------------------

-- Potato facility
WITH t AS (SELECT tenant_id FROM tenant WHERE tenant_key='potato_wh')
INSERT INTO location (tenant_id, location_type, name, parent_location_id, site_name, zone, rack, metadata)
SELECT t.tenant_id, 'FACILITY', 'PW-FAC-01 | GoldenSpud Main Warehouse', NULL,
       'Madurai', NULL, NULL,
       '{"address":"Madurai, TN","notes":"Main potato cold store"}'::jsonb
FROM t
WHERE NOT EXISTS (
  SELECT 1 FROM location l
  WHERE l.tenant_id = t.tenant_id AND l.location_type='FACILITY' AND l.name='PW-FAC-01 | GoldenSpud Main Warehouse'
  AND l.parent_location_id IS NULL
);

-- Potato chambers under facility
WITH t AS (SELECT tenant_id FROM tenant WHERE tenant_key='potato_wh'),
fac AS (
  SELECT id AS facility_id FROM location
  WHERE tenant_id=(SELECT tenant_id FROM t)
    AND location_type='FACILITY'
    AND name='PW-FAC-01 | GoldenSpud Main Warehouse'
  LIMIT 1
)
INSERT INTO location (tenant_id, location_type, name, parent_location_id, site_name, zone, rack, metadata)
SELECT (SELECT tenant_id FROM t), 'CHAMBER', 'PW-CH-01 | Fresh Storage (2–4C)', fac.facility_id,
       'Madurai', 'Chamber-01', NULL,
       '{"program":"fresh","target_temp_c":[2,4],"target_humidity_rh":[90,95]}'::jsonb
FROM fac
WHERE NOT EXISTS (
  SELECT 1 FROM location l
  WHERE l.tenant_id=(SELECT tenant_id FROM t) AND l.location_type='CHAMBER'
    AND l.name='PW-CH-01 | Fresh Storage (2–4C)'
);

WITH t AS (SELECT tenant_id FROM tenant WHERE tenant_key='potato_wh'),
fac AS (
  SELECT id AS facility_id FROM location
  WHERE tenant_id=(SELECT tenant_id FROM t)
    AND location_type='FACILITY'
    AND name='PW-FAC-01 | GoldenSpud Main Warehouse'
  LIMIT 1
)
INSERT INTO location (tenant_id, location_type, name, parent_location_id, site_name, zone, rack, metadata)
SELECT (SELECT tenant_id FROM t), 'CHAMBER', 'PW-CH-02 | Processing Storage (6–8C)', fac.facility_id,
       'Madurai', 'Chamber-02', NULL,
       '{"program":"processing","target_temp_c":[6,8],"target_humidity_rh":[85,92]}'::jsonb
FROM fac
WHERE NOT EXISTS (
  SELECT 1 FROM location l
  WHERE l.tenant_id=(SELECT tenant_id FROM t) AND l.location_type='CHAMBER'
    AND l.name='PW-CH-02 | Processing Storage (6–8C)'
);

-- Healthcare facility
WITH t AS (SELECT tenant_id FROM tenant WHERE tenant_key='healthcare_fac')
INSERT INTO location (tenant_id, location_type, name, parent_location_id, site_name, zone, rack, metadata)
SELECT t.tenant_id, 'FACILITY', 'HC-FAC-01 | CareWell Hospital Chennai', NULL,
       'Chennai', NULL, NULL,
       '{"address":"Chennai, TN","notes":"Hospital facility monitoring"}'::jsonb
FROM t
WHERE NOT EXISTS (
  SELECT 1 FROM location l
  WHERE l.tenant_id = t.tenant_id AND l.location_type='FACILITY' AND l.name='HC-FAC-01 | CareWell Hospital Chennai'
  AND l.parent_location_id IS NULL
);

-- Healthcare ICU zone under facility (2nd location)
WITH t AS (SELECT tenant_id FROM tenant WHERE tenant_key='healthcare_fac'),
fac AS (
  SELECT id AS facility_id FROM location
  WHERE tenant_id=(SELECT tenant_id FROM t)
    AND location_type='FACILITY'
    AND name='HC-FAC-01 | CareWell Hospital Chennai'
  LIMIT 1
)
INSERT INTO location (tenant_id, location_type, name, parent_location_id, site_name, zone, rack, metadata)
SELECT (SELECT tenant_id FROM t), 'ZONE', 'HC-ICU-01 | ICU West Wing', fac.facility_id,
       'Chennai', 'ICU', NULL,
       '{"air_quality":"co2","target_temp_c":[20,24],"target_humidity_rh":[40,60]}'::jsonb
FROM fac
WHERE NOT EXISTS (
  SELECT 1 FROM location l
  WHERE l.tenant_id=(SELECT tenant_id FROM t) AND l.location_type='ZONE'
    AND l.name='HC-ICU-01 | ICU West Wing'
);

-- ------------------------------------------------------------
-- 3) Sensors (all 6 categories)
--    Metrics we will use in k6:
--      temperature (C), humidity (%RH), co2_ppm (ppm),
--      door_open_seconds (s), lux (lux), power_kw (kW)
-- ------------------------------------------------------------

-- POTATO: sensors in each chamber + 1 energy meter at facility
WITH t AS (SELECT tenant_id FROM tenant WHERE tenant_key='potato_wh'),
ch1 AS (
  SELECT id AS location_id FROM location
  WHERE tenant_id=(SELECT tenant_id FROM t) AND name='PW-CH-01 | Fresh Storage (2–4C)' LIMIT 1
),
ch2 AS (
  SELECT id AS location_id FROM location
  WHERE tenant_id=(SELECT tenant_id FROM t) AND name='PW-CH-02 | Processing Storage (6–8C)' LIMIT 1
),
fac AS (
  SELECT id AS location_id FROM location
  WHERE tenant_id=(SELECT tenant_id FROM t) AND name='PW-FAC-01 | GoldenSpud Main Warehouse' LIMIT 1
)
INSERT INTO sensor (tenant_id, sensor_code, sensor_type, location_id, status, metadata)
SELECT (SELECT tenant_id FROM t), x.sensor_code, x.sensor_type, x.location_id, 'ACTIVE', x.metadata
FROM (
  VALUES
  -- Chamber 01
  ('PW-CH1-TEMP-01','TEMP',     (SELECT location_id FROM ch1), '{"model":"SHT31","placement":"near_air_return"}'::jsonb),
  ('PW-CH1-HUM-01', 'HUMIDITY', (SELECT location_id FROM ch1), '{"model":"SHT31","placement":"mid_height"}'::jsonb),
  ('PW-CH1-CO2-01', 'GAS',      (SELECT location_id FROM ch1), '{"gas":"CO2","range_ppm":[0,10000]}'::jsonb),
  ('PW-CH1-DOOR-01','DOOR',     (SELECT location_id FROM ch1), '{"door":"chamber_entry","type":"reed_switch"}'::jsonb),
  ('PW-CH1-LUX-01', 'LIGHT',    (SELECT location_id FROM ch1), '{"sensor":"LDR","notes":"lights should be low"}'::jsonb),

  -- Chamber 02
  ('PW-CH2-TEMP-01','TEMP',     (SELECT location_id FROM ch2), '{"model":"SHT31","placement":"near_evaporator"}'::jsonb),
  ('PW-CH2-HUM-01', 'HUMIDITY', (SELECT location_id FROM ch2), '{"model":"SHT31","placement":"mid_height"}'::jsonb),
  ('PW-CH2-CO2-01', 'GAS',      (SELECT location_id FROM ch2), '{"gas":"CO2","range_ppm":[0,10000]}'::jsonb),
  ('PW-CH2-DOOR-01','DOOR',     (SELECT location_id FROM ch2), '{"door":"chamber_entry","type":"reed_switch"}'::jsonb),
  ('PW-CH2-LUX-01', 'LIGHT',    (SELECT location_id FROM ch2), '{"sensor":"LDR"}'::jsonb),

  -- Facility energy meter
  ('PW-FAC-EM-01',  'ENERGY',   (SELECT location_id FROM fac), '{"meter":"main_panel","phase":"3P","unit":"kW"}'::jsonb)
) AS x(sensor_code, sensor_type, location_id, metadata)
ON CONFLICT (tenant_id, sensor_code)
DO UPDATE SET
  sensor_type = EXCLUDED.sensor_type,
  location_id = EXCLUDED.location_id,
  status      = EXCLUDED.status,
  metadata    = EXCLUDED.metadata;

-- HEALTHCARE: sensors for ICU + 1 facility energy meter
WITH t AS (SELECT tenant_id FROM tenant WHERE tenant_key='healthcare_fac'),
icu AS (
  SELECT id AS location_id FROM location
  WHERE tenant_id=(SELECT tenant_id FROM t) AND name='HC-ICU-01 | ICU West Wing' LIMIT 1
),
fac AS (
  SELECT id AS location_id FROM location
  WHERE tenant_id=(SELECT tenant_id FROM t) AND name='HC-FAC-01 | CareWell Hospital Chennai' LIMIT 1
)
INSERT INTO sensor (tenant_id, sensor_code, sensor_type, location_id, status, metadata)
SELECT (SELECT tenant_id FROM t), x.sensor_code, x.sensor_type, x.location_id, 'ACTIVE', x.metadata
FROM (
  VALUES
  ('HC-ICU-TEMP-01', 'TEMP',     (SELECT location_id FROM icu), '{"area":"ICU_ambient"}'::jsonb),
  ('HC-ICU-HUM-01',  'HUMIDITY', (SELECT location_id FROM icu), '{"area":"ICU_ambient"}'::jsonb),
  ('HC-ICU-CO2-01',  'GAS',      (SELECT location_id FROM icu), '{"gas":"CO2","purpose":"air_quality"}'::jsonb),
  ('HC-ICU-DOOR-01', 'DOOR',     (SELECT location_id FROM icu), '{"door":"icu_access","policy":"restricted"}'::jsonb),
  ('HC-ICU-LUX-01',  'LIGHT',    (SELECT location_id FROM icu), '{"sensor":"LDR","purpose":"night_monitoring"}'::jsonb),

  -- Vaccine fridge temp sensor (still ICU zone)
  ('HC-ICU-FRIDGE-TEMP-01','TEMP',(SELECT location_id FROM icu), '{"asset":"vaccine_fridge","setpoint_c":[2,8]}'::jsonb),

  -- Facility energy meter
  ('HC-FAC-EM-01',   'ENERGY',   (SELECT location_id FROM fac), '{"meter":"main_panel","phase":"3P","unit":"kW"}'::jsonb)
) AS x(sensor_code, sensor_type, location_id, metadata)
ON CONFLICT (tenant_id, sensor_code)
DO UPDATE SET
  sensor_type = EXCLUDED.sensor_type,
  location_id = EXCLUDED.location_id,
  status      = EXCLUDED.status,
  metadata    = EXCLUDED.metadata;

-- ------------------------------------------------------------
-- 4) Threshold rules
--    Tenant defaults (broad) + overrides:
--      Potato: LOCATION rules for CH-01 and CH-02
--      Healthcare: LOCATION rules for ICU + SENSOR rule for fridge temp
-- ------------------------------------------------------------

-- POTATO tenant defaults (broad safety rails)
WITH t AS (SELECT tenant_id FROM tenant WHERE tenant_key='potato_wh')
INSERT INTO threshold_rule
(tenant_id, scope, metric, min_value, max_value, warning_margin, critical_margin, rule_version, priority, active, metadata)
SELECT (SELECT tenant_id FROM t), 'TENANT', x.metric, x.minv, x.maxv, x.warn, x.crit, 'pw-tenant-v1', 100, TRUE, x.meta
FROM (VALUES
  ('temperature', 0.0, 10.0, 1.0, 2.0, '{"notes":"default cold-storage rail"}'::jsonb),
  ('humidity',   70.0, 98.0, 3.0, 5.0, '{"notes":"default humidity rail"}'::jsonb),
  ('co2_ppm',     0.0, 5000.0, 500.0, 1000.0, '{"notes":"air safety / ventilation trigger"}'::jsonb),
  ('door_open_seconds', 0.0, 300.0, 0.0, 0.0, '{"notes":"default door duration"}'::jsonb),
  ('lux',         0.0, 500.0, 100.0, 200.0, '{"notes":"light on may indicate inspection/door activity"}'::jsonb),
  ('power_kw',    0.0, 120.0, 10.0, 20.0, '{"notes":"facility power anomaly rail"}'::jsonb)
) AS x(metric, minv, maxv, warn, crit, meta)
ON CONFLICT (tenant_id, metric) WHERE scope='TENANT' AND active=TRUE
DO UPDATE SET
  min_value = EXCLUDED.min_value,
  max_value = EXCLUDED.max_value,
  warning_margin = EXCLUDED.warning_margin,
  critical_margin = EXCLUDED.critical_margin,
  rule_version = EXCLUDED.rule_version,
  priority = EXCLUDED.priority,
  metadata = EXCLUDED.metadata;

-- POTATO chamber overrides
WITH t AS (SELECT tenant_id FROM tenant WHERE tenant_key='potato_wh'),
ch1 AS (SELECT id AS location_id FROM location WHERE tenant_id=(SELECT tenant_id FROM t) AND name='PW-CH-01 | Fresh Storage (2–4C)' LIMIT 1),
ch2 AS (SELECT id AS location_id FROM location WHERE tenant_id=(SELECT tenant_id FROM t) AND name='PW-CH-02 | Processing Storage (6–8C)' LIMIT 1)
INSERT INTO threshold_rule
(tenant_id, scope, metric, min_value, max_value, warning_margin, critical_margin, rule_version, priority, active, location_id, metadata)
SELECT (SELECT tenant_id FROM t), 'LOCATION', x.metric, x.minv, x.maxv, x.warn, x.crit, x.ver, 300, TRUE, x.loc, x.meta
FROM (
  VALUES
  -- Chamber 01 (Fresh: 2–4C, RH 90–95)
  ('temperature', 2.0, 4.0, 0.5, 1.0, 'pw-ch1-v1', (SELECT location_id FROM ch1), '{"program":"fresh"}'::jsonb),
  ('humidity',   90.0, 95.0, 2.0, 4.0, 'pw-ch1-v1', (SELECT location_id FROM ch1), '{"program":"fresh"}'::jsonb),
  ('co2_ppm',     0.0, 4000.0, 500.0, 1000.0, 'pw-ch1-v1', (SELECT location_id FROM ch1), '{"program":"fresh","notes":"ventilation"}'::jsonb),
  ('door_open_seconds', 0.0, 120.0, 0.0, 0.0, 'pw-ch1-v1', (SELECT location_id FROM ch1), '{"door_policy":"keep_closed"}'::jsonb),
  ('lux',         0.0, 200.0, 100.0, 200.0, 'pw-ch1-v1', (SELECT location_id FROM ch1), '{"notes":"lights should be low"}'::jsonb),

  -- Chamber 02 (Processing: 6–8C, RH 85–92)
  ('temperature', 6.0, 8.0, 0.5, 1.0, 'pw-ch2-v1', (SELECT location_id FROM ch2), '{"program":"processing"}'::jsonb),
  ('humidity',   85.0, 92.0, 3.0, 5.0, 'pw-ch2-v1', (SELECT location_id FROM ch2), '{"program":"processing"}'::jsonb),
  ('co2_ppm',     0.0, 4500.0, 500.0, 1000.0, 'pw-ch2-v1', (SELECT location_id FROM ch2), '{"program":"processing"}'::jsonb),
  ('door_open_seconds', 0.0, 120.0, 0.0, 0.0, 'pw-ch2-v1', (SELECT location_id FROM ch2), '{"door_policy":"keep_closed"}'::jsonb),
  ('lux',         0.0, 250.0, 100.0, 200.0, 'pw-ch2-v1', (SELECT location_id FROM ch2), '{"notes":"inspection light"}'::jsonb)
) AS x(metric, minv, maxv, warn, crit, ver, loc, meta)
ON CONFLICT (tenant_id, location_id, metric) WHERE scope='LOCATION' AND active=TRUE
DO UPDATE SET
  min_value = EXCLUDED.min_value,
  max_value = EXCLUDED.max_value,
  warning_margin = EXCLUDED.warning_margin,
  critical_margin = EXCLUDED.critical_margin,
  rule_version = EXCLUDED.rule_version,
  priority = EXCLUDED.priority,
  metadata = EXCLUDED.metadata;

-- HEALTHCARE tenant defaults (broad)
WITH t AS (SELECT tenant_id FROM tenant WHERE tenant_key='healthcare_fac')
INSERT INTO threshold_rule
(tenant_id, scope, metric, min_value, max_value, warning_margin, critical_margin, rule_version, priority, active, metadata)
SELECT (SELECT tenant_id FROM t), 'TENANT', x.metric, x.minv, x.maxv, x.warn, x.crit, 'hc-tenant-v1', 100, TRUE, x.meta
FROM (VALUES
  ('temperature', 18.0, 28.0, 1.0, 2.0, '{"notes":"ambient rail"}'::jsonb),
  ('humidity',    30.0, 65.0, 5.0, 10.0, '{"notes":"comfort + equipment rail"}'::jsonb),
  ('co2_ppm',       0.0, 1500.0, 200.0, 500.0, '{"notes":"air quality"}'::jsonb),
  ('door_open_seconds', 0.0, 30.0, 0.0, 0.0, '{"notes":"security/airflow"}'::jsonb),
  ('lux',           0.0, 1200.0, 300.0, 600.0, '{"notes":"general lighting"}'::jsonb),
  ('power_kw',      0.0, 250.0, 25.0, 50.0, '{"notes":"facility power anomaly rail"}'::jsonb)
) AS x(metric, minv, maxv, warn, crit, meta)
ON CONFLICT (tenant_id, metric) WHERE scope='TENANT' AND active=TRUE
DO UPDATE SET
  min_value = EXCLUDED.min_value,
  max_value = EXCLUDED.max_value,
  warning_margin = EXCLUDED.warning_margin,
  critical_margin = EXCLUDED.critical_margin,
  rule_version = EXCLUDED.rule_version,
  priority = EXCLUDED.priority,
  metadata = EXCLUDED.metadata;

-- HEALTHCARE ICU location overrides
WITH t AS (SELECT tenant_id FROM tenant WHERE tenant_key='healthcare_fac'),
icu AS (SELECT id AS location_id FROM location WHERE tenant_id=(SELECT tenant_id FROM t) AND name='HC-ICU-01 | ICU West Wing' LIMIT 1)
INSERT INTO threshold_rule
(tenant_id, scope, metric, min_value, max_value, warning_margin, critical_margin, rule_version, priority, active, location_id, metadata)
SELECT (SELECT tenant_id FROM t), 'LOCATION', x.metric, x.minv, x.maxv, x.warn, x.crit, 'hc-icu-v1', 300, TRUE, (SELECT location_id FROM icu), x.meta
FROM (VALUES
  ('temperature', 20.0, 24.0, 1.0, 2.0, '{"area":"ICU_ambient"}'::jsonb),
  ('humidity',    40.0, 60.0, 5.0, 10.0, '{"area":"ICU_ambient"}'::jsonb),
  ('co2_ppm',       0.0, 1000.0, 200.0, 500.0, '{"purpose":"air_quality"}'::jsonb),
  ('door_open_seconds', 0.0, 10.0, 0.0, 0.0, '{"purpose":"restricted_access"}'::jsonb),
  ('lux',           0.0, 800.0, 300.0, 600.0, '{"purpose":"night_monitoring"}'::jsonb)
) AS x(metric, minv, maxv, warn, crit, meta)
ON CONFLICT (tenant_id, location_id, metric) WHERE scope='LOCATION' AND active=TRUE
DO UPDATE SET
  min_value = EXCLUDED.min_value,
  max_value = EXCLUDED.max_value,
  warning_margin = EXCLUDED.warning_margin,
  critical_margin = EXCLUDED.critical_margin,
  rule_version = EXCLUDED.rule_version,
  priority = EXCLUDED.priority,
  metadata = EXCLUDED.metadata;

-- HEALTHCARE SENSOR override for vaccine fridge temperature (2–8C)
WITH t AS (SELECT tenant_id FROM tenant WHERE tenant_key='healthcare_fac'),
s AS (
  SELECT id AS sensor_id
  FROM sensor
  WHERE tenant_id=(SELECT tenant_id FROM t) AND sensor_code='HC-ICU-FRIDGE-TEMP-01'
  LIMIT 1
)
INSERT INTO threshold_rule
(tenant_id, scope, metric, min_value, max_value, warning_margin, critical_margin, rule_version, priority, active, sensor_id, metadata)
SELECT (SELECT tenant_id FROM t), 'SENSOR', 'temperature', 2.0, 8.0, 0.5, 1.0, 'hc-fridge-v1', 500, TRUE,
       (SELECT sensor_id FROM s),
       '{"asset":"vaccine_fridge","notes":"cold-chain compliance"}'::jsonb
ON CONFLICT (tenant_id, sensor_id, metric) WHERE scope='SENSOR' AND active=TRUE
DO UPDATE SET
  min_value = EXCLUDED.min_value,
  max_value = EXCLUDED.max_value,
  warning_margin = EXCLUDED.warning_margin,
  critical_margin = EXCLUDED.critical_margin,
  rule_version = EXCLUDED.rule_version,
  priority = EXCLUDED.priority,
  metadata = EXCLUDED.metadata;

-- ------------------------------------------------------------
-- 5) Seed readings (facts) + violations (derived)
--    (Enough data to make dashboards + detector validation easy)
-- ------------------------------------------------------------

-- POTATO: some readings in CH1 + CH2 (include violations)
WITH t AS (SELECT tenant_id FROM tenant WHERE tenant_key='potato_wh'),
s AS (
  SELECT tenant_id, id AS sensor_id, sensor_code
  FROM sensor
  WHERE tenant_id=(SELECT tenant_id FROM t)
    AND sensor_code IN ('PW-CH1-TEMP-01','PW-CH1-HUM-01','PW-CH1-CO2-01','PW-CH1-DOOR-01','PW-CH1-LUX-01',
                        'PW-CH2-TEMP-01','PW-CH2-HUM-01')
)
INSERT INTO sensor_reading
(tenant_id, event_id, sensor_id, sensor_code, metric, value, unit, observed_at, ingested_at, scenario, data_profile, tags, raw_payload, correlation_id, trace_id)
SELECT (SELECT tenant_id FROM t), x.event_id, s.sensor_id, s.sensor_code, x.metric, x.value, x.unit,
       NOW() - x.obs_ago, NOW(),
       'steady',
       'DP2',
       jsonb_build_object('run_label','seed_lp1_dp2','tenant_mode','single','load_profile','LP1','data_profile','DP2'),
       jsonb_build_object(
         'tenant_key','potato_wh',
         'sensor_code',s.sensor_code,
         'metric',x.metric,
         'value',x.value,
         'unit',x.unit,
         'observed_at', (NOW() - x.obs_ago),
         'scenario','steady',
         'data_profile','DP2',
         'correlation_id', x.corr,
         'trace_id', CONCAT('trace-', x.corr),
         'tags', jsonb_build_object('run_label','seed_lp1_dp2','tenant_mode','single','load_profile','LP1','data_profile','DP2')
       ),
       x.corr,
       CONCAT('trace-', x.corr)
FROM (
  VALUES
  -- Chamber 01
  ('SEED-PW-CH1-TEMP-OK-001',  'PW-CH1-TEMP-01','temperature', 3.2, 'C',   INTERVAL '15 minutes', 'corr-pw-001'),
  ('SEED-PW-CH1-TEMP-HI-002',  'PW-CH1-TEMP-01','temperature', 6.5, 'C',   INTERVAL '10 minutes', 'corr-pw-002'), -- violation high
  ('SEED-PW-CH1-HUM-LOW-003',  'PW-CH1-HUM-01', 'humidity',   86.0,'%RH', INTERVAL '9 minutes',  'corr-pw-003'), -- violation low
  ('SEED-PW-CH1-CO2-OK-004',   'PW-CH1-CO2-01', 'co2_ppm',   2200.0,'ppm', INTERVAL '8 minutes',  'corr-pw-004'),
  ('SEED-PW-CH1-DOOR-OK-005',  'PW-CH1-DOOR-01','door_open_seconds', 25.0,'s', INTERVAL '7 minutes', 'corr-pw-005'),
  ('SEED-PW-CH1-LUX-HI-006',   'PW-CH1-LUX-01', 'lux',       420.0,'lux', INTERVAL '6 minutes',  'corr-pw-006'), -- violation high

  -- Chamber 02
  ('SEED-PW-CH2-TEMP-OK-007',  'PW-CH2-TEMP-01','temperature', 7.1,'C',   INTERVAL '5 minutes',  'corr-pw-007'),
  ('SEED-PW-CH2-HUM-OK-008',   'PW-CH2-HUM-01', 'humidity',   88.0,'%RH', INTERVAL '4 minutes',  'corr-pw-008')
) AS x(event_id, sensor_code, metric, value, unit, obs_ago, corr)
JOIN s ON s.sensor_code = x.sensor_code
ON CONFLICT (tenant_id, event_id) DO NOTHING;

-- POTATO: create violations for the seeded out-of-range readings
WITH t AS (SELECT tenant_id FROM tenant WHERE tenant_key='potato_wh'),
bad AS (
  SELECT r.*
  FROM sensor_reading r
  WHERE r.tenant_id=(SELECT tenant_id FROM t)
    AND r.event_id IN ('SEED-PW-CH1-TEMP-HI-002','SEED-PW-CH1-HUM-LOW-003','SEED-PW-CH1-LUX-HI-006')
),
rule_pick AS (
  -- pick the most specific active LOCATION rule based on the sensor's location
  SELECT
    b.id AS reading_id,
    tr.id AS rule_id,
    b.metric,
    b.value
  FROM bad b
  JOIN sensor s ON s.tenant_id=b.tenant_id AND s.id=b.sensor_id
  JOIN threshold_rule tr
    ON tr.tenant_id=b.tenant_id
   AND tr.scope='LOCATION'
   AND tr.active=TRUE
   AND tr.location_id=s.location_id
   AND tr.metric=b.metric
  LIMIT 1000
)
INSERT INTO sensor_violation
(tenant_id, reading_id, rule_id, violation_type, severity, expected_min, expected_max, actual_value, status, detected_at, notes)
SELECT
  (SELECT tenant_id FROM t),
  rp.reading_id,
  rp.rule_id,
  CASE
    WHEN rp.metric='temperature' AND rp.value > (SELECT max_value FROM threshold_rule WHERE id=rp.rule_id) THEN 'HIGH_TEMP'
    WHEN rp.metric='humidity'    AND rp.value < (SELECT min_value FROM threshold_rule WHERE id=rp.rule_id) THEN 'LOW_HUMIDITY'
    WHEN rp.metric='lux'         AND rp.value > (SELECT max_value FROM threshold_rule WHERE id=rp.rule_id) THEN 'HIGH_LIGHT'
    ELSE 'OUT_OF_RANGE'
  END,
  CASE
    WHEN rp.metric IN ('temperature','humidity') THEN 'CRITICAL'
    ELSE 'WARN'
  END,
  (SELECT min_value FROM threshold_rule WHERE id=rp.rule_id),
  (SELECT max_value FROM threshold_rule WHERE id=rp.rule_id),
  rp.value,
  'OPEN',
  NOW(),
  'Seeded violation for detector/UI testing'
FROM rule_pick rp
ON CONFLICT DO NOTHING;

-- HEALTHCARE: seed ICU ambient + fridge temp (include violation for fridge)
WITH t AS (SELECT tenant_id FROM tenant WHERE tenant_key='healthcare_fac'),
s AS (
  SELECT tenant_id, id AS sensor_id, sensor_code
  FROM sensor
  WHERE tenant_id=(SELECT tenant_id FROM t)
    AND sensor_code IN ('HC-ICU-TEMP-01','HC-ICU-HUM-01','HC-ICU-CO2-01','HC-ICU-DOOR-01','HC-ICU-LUX-01','HC-ICU-FRIDGE-TEMP-01')
)
INSERT INTO sensor_reading
(tenant_id, event_id, sensor_id, sensor_code, metric, value, unit, observed_at, ingested_at, scenario, data_profile, tags, raw_payload, correlation_id, trace_id)
SELECT (SELECT tenant_id FROM t), x.event_id, s.sensor_id, s.sensor_code, x.metric, x.value, x.unit,
       NOW() - x.obs_ago, NOW(),
       'steady',
       'DP4',
       jsonb_build_object('run_label','seed_lp1_dp4','tenant_mode','single','load_profile','LP1','data_profile','DP4'),
       jsonb_build_object(
         'tenant_key','healthcare_fac',
         'sensor_code',s.sensor_code,
         'metric',x.metric,
         'value',x.value,
         'unit',x.unit,
         'observed_at', (NOW() - x.obs_ago),
         'scenario','steady',
         'data_profile','DP4',
         'correlation_id', x.corr,
         'trace_id', CONCAT('trace-', x.corr),
         'tags', jsonb_build_object('run_label','seed_lp1_dp4','tenant_mode','single','load_profile','LP1','data_profile','DP4')
       ),
       x.corr,
       CONCAT('trace-', x.corr)
FROM (
  VALUES
  ('SEED-HC-ICU-TEMP-OK-001',        'HC-ICU-TEMP-01',        'temperature', 22.1, 'C',   INTERVAL '12 minutes', 'corr-hc-001'),
  ('SEED-HC-ICU-HUM-OK-002',         'HC-ICU-HUM-01',         'humidity',    48.0, '%RH', INTERVAL '11 minutes', 'corr-hc-002'),
  ('SEED-HC-ICU-CO2-WARN-003',       'HC-ICU-CO2-01',         'co2_ppm',    1200.0,'ppm', INTERVAL '10 minutes', 'corr-hc-003'), -- likely violation vs ICU rule (max 1000)
  ('SEED-HC-ICU-DOOR-OK-004',        'HC-ICU-DOOR-01',        'door_open_seconds', 6.0,'s', INTERVAL '9 minutes', 'corr-hc-004'),
  ('SEED-HC-ICU-LUX-OK-005',         'HC-ICU-LUX-01',         'lux',        300.0,'lux', INTERVAL '8 minutes',  'corr-hc-005'),
  ('SEED-HC-FRIDGE-TEMP-HI-006',     'HC-ICU-FRIDGE-TEMP-01', 'temperature', 9.5, 'C',   INTERVAL '7 minutes',  'corr-hc-006') -- violation high (2–8)
) AS x(event_id, sensor_code, metric, value, unit, obs_ago, corr)
JOIN s ON s.sensor_code = x.sensor_code
ON CONFLICT (tenant_id, event_id) DO NOTHING;

-- HEALTHCARE: violations (CO2 high vs ICU location rule, fridge temp high vs SENSOR rule)
WITH t AS (SELECT tenant_id FROM tenant WHERE tenant_key='healthcare_fac'),
bad AS (
  SELECT r.*
  FROM sensor_reading r
  WHERE r.tenant_id=(SELECT tenant_id FROM t)
    AND r.event_id IN ('SEED-HC-ICU-CO2-WARN-003','SEED-HC-FRIDGE-TEMP-HI-006')
),
picked AS (
  SELECT
    b.id AS reading_id,
    b.metric,
    b.value,
    -- choose SENSOR rule if exists, else LOCATION rule
    COALESCE(tr_sensor.id, tr_loc.id) AS rule_id
  FROM bad b
  JOIN sensor s ON s.tenant_id=b.tenant_id AND s.id=b.sensor_id
  LEFT JOIN threshold_rule tr_sensor
    ON tr_sensor.tenant_id=b.tenant_id AND tr_sensor.scope='SENSOR' AND tr_sensor.active=TRUE
   AND tr_sensor.sensor_id=s.id AND tr_sensor.metric=b.metric
  LEFT JOIN threshold_rule tr_loc
    ON tr_loc.tenant_id=b.tenant_id AND tr_loc.scope='LOCATION' AND tr_loc.active=TRUE
   AND tr_loc.location_id=s.location_id AND tr_loc.metric=b.metric
)
INSERT INTO sensor_violation
(tenant_id, reading_id, rule_id, violation_type, severity, expected_min, expected_max, actual_value, status, detected_at, notes)
SELECT
  (SELECT tenant_id FROM t),
  p.reading_id,
  p.rule_id,
  CASE
    WHEN p.metric='temperature' AND p.value > (SELECT max_value FROM threshold_rule WHERE id=p.rule_id) THEN 'HIGH_TEMP'
    WHEN p.metric='co2_ppm'     AND p.value > (SELECT max_value FROM threshold_rule WHERE id=p.rule_id) THEN 'HIGH_CO2'
    ELSE 'OUT_OF_RANGE'
  END,
  CASE
    WHEN p.metric='temperature' THEN 'CRITICAL'
    ELSE 'WARN'
  END,
  (SELECT min_value FROM threshold_rule WHERE id=p.rule_id),
  (SELECT max_value FROM threshold_rule WHERE id=p.rule_id),
  p.value,
  'OPEN',
  NOW(),
  'Seeded violation for detector/UI testing'
FROM picked p
WHERE p.rule_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 6) Dead-letter event (one example)
-- ------------------------------------------------------------
INSERT INTO dead_letter_event
(tenant_id, event_id, source, error_type, error_message, kafka_topic, kafka_partition, kafka_offset, raw_payload)
SELECT
  (SELECT tenant_id FROM tenant WHERE tenant_key='potato_wh'),
  'SEED-DLE-001',
  'detector',
  'SCHEMA_MISMATCH',
  'metric "temp_celsius" is not supported; expected "temperature"',
  'events.ingest.v1',
  0,
  9999,
  '{"tenant_key":"potato_wh","sensor_code":"PW-CH1-TEMP-01","metric":"temp_celsius","value":3.4,"unit":"C"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM dead_letter_event WHERE event_id='SEED-DLE-001'
);

COMMIT;

-- ------------------------------------------------------------
-- Quick lookup: use this output to configure k6 payloads
-- ------------------------------------------------------------
-- Tenants:
--   SELECT tenant_key, tenant_id FROM tenant ORDER BY tenant_key;
--
-- Sensors (codes to use in k6):
--   SELECT t.tenant_key, s.sensor_code, s.sensor_type, l.name AS location
--   FROM sensor s
--   JOIN tenant t ON t.tenant_id=s.tenant_id
--   LEFT JOIN location l ON l.tenant_id=s.tenant_id AND l.id=s.location_id
--   ORDER BY t.tenant_key, l.name, s.sensor_code;
