# app/tools.py
"""
Retrieval tools that the GenAI graph will call.

These are plain Python functions that talk to ES and Postgres and return small,
LLM-friendly JSON blobs.
"""

from typing import Any, Dict, List, Optional

from .config import get_settings
from .logger import logger
from .db import get_threshold, get_recent_violations_from_pg
from .es_client import search_violations_es

settings = get_settings()


def compute_minutes_from_window(window: Optional[str]) -> int:
    """
    Convert a simple time window string to minutes.

    Supported examples:
      - "1h"  => 60
      - "2h"  => 120
      - "30m" => 30
    Fallback: settings.DEFAULT_TIME_WINDOW_MINUTES
    """
    if not window:
        return settings.DEFAULT_TIME_WINDOW_MINUTES

    try:
        if window.endswith("h"):
            hours = int(window[:-1])
            return hours * 60
        if window.endswith("m"):
            return int(window[:-1])
    except ValueError:
        logger.warning("Invalid timeWindow=%s, using default", window)

    return settings.DEFAULT_TIME_WINDOW_MINUTES


def _stats_from_examples(examples: List[Dict[str, Any]]) -> Dict[str, Any]:
    by_severity: Dict[str, int] = {}
    by_violation_type: Dict[str, int] = {}

    for item in examples:
        severity = item.get("severity")
        violation_type = item.get("violation_type")
        if severity:
            by_severity[severity] = by_severity.get(severity, 0) + 1
        if violation_type:
            by_violation_type[violation_type] = (
                by_violation_type.get(violation_type, 0) + 1
            )

    return {
        "by_severity": by_severity,
        "by_violation_type": by_violation_type,
        "total_hits": len(examples),
    }


def _format_es_examples(hits: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    examples: List[Dict[str, Any]] = []
    for hit in hits[:10]:
        source = hit.get("_source", {})
        examples.append(
            {
                "tenant_key": source.get("tenant_key"),
                "sensor_code": source.get("sensor_code"),
                "metric": source.get("metric"),
                "severity": source.get("severity"),
                "violation_type": source.get("violation_type"),
                "value": source.get("value"),
                "expected_min": source.get("expected_min"),
                "expected_max": source.get("expected_max"),
                "observed_at": source.get("observed_at"),
                "detected_at": source.get("detected_at"),
                "rule_version": source.get("rule_version"),
                "scenario": source.get("scenario"),
                "data_profile": source.get("data_profile"),
                "correlation_id": source.get("correlation_id"),
                "trace_id": source.get("trace_id"),
                "tags": source.get("tags"),
                "location": source.get("location"),
            }
        )
    return examples


def _format_pg_examples(
    rows: List[Dict[str, Any]],
    tenant_key: str,
) -> List[Dict[str, Any]]:
    examples: List[Dict[str, Any]] = []
    for row in rows[:10]:
        actual_value = row.get("actual_value")
        examples.append(
            {
                "tenant_key": tenant_key,
                "sensor_code": row.get("sensor_code"),
                "metric": row.get("metric"),
                "severity": row.get("severity"),
                "violation_type": row.get("violation_type"),
                "value": actual_value if actual_value is not None else row.get("value"),
                "expected_min": row.get("expected_min"),
                "expected_max": row.get("expected_max"),
                "observed_at": row.get("observed_at"),
                "detected_at": row.get("detected_at"),
                "rule_version": row.get("rule_version"),
                "scenario": row.get("scenario"),
                "data_profile": row.get("data_profile"),
                "correlation_id": row.get("correlation_id"),
                "trace_id": row.get("trace_id"),
                "tags": row.get("tags"),
                "location": {
                    "site_name": row.get("site_name"),
                    "zone": row.get("zone"),
                    "rack": row.get("rack"),
                },
            }
        )
    return examples


def tool_fetch_violations(
    tenant_key: Optional[str],
    sensor_code: Optional[str],
    metric: Optional[str],
    scenario: Optional[str],
    data_profile: Optional[str],
    time_window: Optional[str],
) -> Dict[str, Any]:
    """
    Tool: fetch violations from Elasticsearch for a given tenant and time window.

    Returns a small JSON object with:
      - stats: aggregated counts
      - examples: a few recent violation docs
    """
    minutes = compute_minutes_from_window(time_window)

    if not tenant_key:
        return {
            "source": "validation-error",
            "time_window_minutes": minutes,
            "stats": {},
            "examples": [],
            "error": "tenant_key is required to query violations",
        }

    es_error: Optional[str] = None
    try:
        es_response = search_violations_es(
            tenant_key=tenant_key,
            sensor_code=sensor_code,
            metric=metric,
            scenario=scenario,
            data_profile=data_profile,
            minutes=minutes,
            severity_filter=None,  # include WARN + CRITICAL
            size=50,
        )

        total_hits = es_response.get("hits", {}).get("total", {}).get("value", 0)
        if total_hits > 0:
            aggs = es_response.get("aggregations", {})
            by_severity = {
                b["key"]: b["doc_count"]
                for b in aggs.get("by_severity", {}).get("buckets", [])
            }
            by_violation = {
                b["key"]: b["doc_count"]
                for b in aggs.get("by_violation_type", {}).get("buckets", [])
            }

            hits = es_response.get("hits", {}).get("hits", [])
            examples = _format_es_examples(hits)

            return {
                "source": "elasticsearch",
                "time_window_minutes": minutes,
                "stats": {
                    "by_severity": by_severity,
                    "by_violation_type": by_violation,
                    "total_hits": total_hits,
                },
                "examples": examples,
            }
    except Exception as exc:
        es_error = str(exc)
        logger.error("ES query failed: %s", exc)

    # Fall back to Postgres when ES is empty or unavailable.
    pg_rows = get_recent_violations_from_pg(
        tenant_key=tenant_key,
        minutes=minutes,
        sensor_code=sensor_code,
        metric=metric,
        scenario=scenario,
        data_profile=data_profile,
        limit=50,
    )
    pg_examples = _format_pg_examples(pg_rows, tenant_key=tenant_key)
    response: Dict[str, Any] = {
        "source": "postgres",
        "time_window_minutes": minutes,
        "stats": _stats_from_examples(pg_examples),
        "examples": pg_examples,
    }

    if es_error:
        response["fallback_reason"] = "es_error"
        response["error"] = es_error
    else:
        response["fallback_reason"] = "es_empty"

    return response


def tool_fetch_threshold(
    tenant_key: Optional[str],
    sensor_code: Optional[str],
    metric: Optional[str],
) -> Optional[Dict[str, Any]]:
    """
    Tool: fetch the current threshold rule for the given tenant/sensor/metric.
    """
    if not tenant_key or not sensor_code or not metric:
        return None
    rule = get_threshold(tenant_key, sensor_code, metric)
    return rule
