# app/db.py
"""
Postgres helper for genai-service.

We only need read access for analytics:
- Resolve tenant + sensor context.
- Fetch threshold rules for a given sensor/metric.
- Fetch recent violations/readings if we want to enrich context.

NOTE: This is sync for simplicity. For heavy traffic, you'd move to asyncpg.
"""

import psycopg2
import psycopg2.extras
from typing import Any, Dict, List, Optional
from .config import get_settings
settings = get_settings()


def _get_connection():
    """
    Create a new Postgres connection.

    In a real system you'd use a connection pool; for this PoC, we open/close
    per request to keep it simple and safe.
    """
    return psycopg2.connect(
        host=settings.PG_HOST,
        port=settings.PG_PORT,
        dbname=settings.PG_DB,
        user=settings.PG_USER,
        password=settings.PG_PASSWORD,
    )


def get_tenant_id_by_key(tenant_key: str) -> Optional[Dict[str, Any]]:
    sql = """
        SELECT tenant_id
        FROM tenant
        WHERE tenant_key = %s
        LIMIT 1
    """
    conn = _get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, (tenant_key,))
            row = cur.fetchone()
            return dict(row) if row else None
    finally:
        conn.close()


def get_sensor_context(tenant_id: str, sensor_code: str) -> Optional[Dict[str, Any]]:
    sql = """
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
        WHERE s.tenant_id = %s
          AND s.sensor_code = %s
        LIMIT 1
    """
    conn = _get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, (tenant_id, sensor_code))
            row = cur.fetchone()
            return dict(row) if row else None
    finally:
        conn.close()


def get_threshold_for(
    tenant_id: str,
    sensor_id: int,
    location_id: Optional[int],
    sensor_type: Optional[str],
    metric: str,
) -> Optional[Dict[str, Any]]:
    sql = """
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
        WHERE tenant_id = %s
          AND metric = %s
          AND active = TRUE
          AND (
            (scope = 'SENSOR' AND sensor_id = %s) OR
            (scope = 'LOCATION' AND location_id = %s) OR
            (scope = 'SENSOR_TYPE' AND sensor_type = %s) OR
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
        LIMIT 1
    """
    conn = _get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, (tenant_id, metric, sensor_id, location_id, sensor_type))
            row = cur.fetchone()
            return dict(row) if row else None
    finally:
        conn.close()


def get_threshold(
    tenant_key: str,
    sensor_code: str,
    metric: str,
) -> Optional[Dict[str, Any]]:
    """
    Fetch the most specific active threshold rule for a given tenant/sensor/metric.
    """
    tenant = get_tenant_id_by_key(tenant_key)
    if not tenant:
        return None

    sensor = get_sensor_context(tenant["tenant_id"], sensor_code)
    if not sensor:
        return None

    return get_threshold_for(
        tenant_id=tenant["tenant_id"],
        sensor_id=sensor["id"],
        location_id=sensor.get("location_id"),
        sensor_type=sensor.get("sensor_type"),
        metric=metric,
    )


def get_recent_violations_from_pg(
    tenant_key: str,
    minutes: int,
    sensor_code: Optional[str] = None,
    metric: Optional[str] = None,
    scenario: Optional[str] = None,
    data_profile: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """
    Optional helper: get violations from Postgres instead of ES.

    Joins sensor_violation with sensor_reading to provide more context.
    Useful as a fallback when ES is down or for cross-checking results.
    """
    tenant = get_tenant_id_by_key(tenant_key)
    if not tenant:
        return []

    clauses = [
        "r.tenant_id = %s",
        "v.detected_at >= NOW() - (%s || ' minutes')::interval",
    ]
    params: List[Any] = [tenant["tenant_id"], minutes]

    if sensor_code:
        clauses.append("r.sensor_code = %s")
        params.append(sensor_code)

    if metric:
        clauses.append("r.metric = %s")
        params.append(metric)

    if scenario:
        clauses.append("r.scenario = %s")
        params.append(scenario)

    if data_profile:
        clauses.append("r.data_profile = %s")
        params.append(data_profile)

    sql = f"""
        SELECT
          v.id AS violation_id,
          r.event_id,
          r.sensor_code,
          r.metric,
          r.unit,
          r.observed_at,
          r.scenario,
          r.data_profile,
          r.correlation_id,
          r.trace_id,
          r.tags,
          v.violation_type,
          v.severity,
          v.actual_value,
          v.expected_min,
          v.expected_max,
          v.rule_id,
          tr.rule_version,
          v.detected_at,
          l.site_name,
          l.zone,
          l.rack
        FROM sensor_violation v
        JOIN sensor_reading r
          ON r.tenant_id = v.tenant_id
         AND r.id = v.reading_id
        LEFT JOIN threshold_rule tr
          ON tr.tenant_id = v.tenant_id
         AND tr.id = v.rule_id
        LEFT JOIN sensor s
          ON s.tenant_id = r.tenant_id
         AND s.id = r.sensor_id
        LEFT JOIN location l
          ON l.tenant_id = r.tenant_id
         AND l.id = s.location_id
        WHERE {" AND ".join(clauses)}
        ORDER BY v.detected_at DESC
        LIMIT %s
    """
    params.append(limit)

    conn = _get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
            return [dict(row) for row in rows]
    finally:
        conn.close()
