# app/es_client.py
"""
Elasticsearch helper for genai-service.

We use HTTP requests directly to keep the dependency surface small.
If you prefer, you can swap to the official `elasticsearch` Python client.
"""

from typing import Any, Dict, List, Optional
import requests

from .config import get_settings
from .logger import logger

settings = get_settings()


def _es_get(path: str, body: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Low-level helper: send a GET/POST to Elasticsearch's REST API.
    We use POST for _search to support a request body.
    """
    url = f"{settings.ES_URL.rstrip('/')}/{path.lstrip('/')}"
    method = "GET" if body is None else "POST"
    logger.debug(f"ES {method} {url}")

    resp = requests.request(method, url, json=body, timeout=5)
    resp.raise_for_status()
    return resp.json()


def search_violations_es(
    tenant_key: Optional[str],
    sensor_code: Optional[str],
    metric: Optional[str],
    scenario: Optional[str],
    data_profile: Optional[str],
    minutes: int,
    severity_filter: Optional[List[str]] = None,
    size: int = 50,
) -> Dict[str, Any]:
    """
    Search violations in Elasticsearch for a given tenant and time range.

    Uses the coldstore-detected-events index populated by indexer-service.
    """

    must_clauses: List[Dict[str, Any]] = [
        {"term": {"has_violation": True}},
    ]

    if tenant_key:
        must_clauses.append({"term": {"tenant_key": tenant_key}})

    if sensor_code:
        must_clauses.append({"term": {"sensor_code": sensor_code}})

    if metric:
        must_clauses.append({"term": {"metric": metric}})

    if scenario:
        must_clauses.append({"term": {"scenario": scenario}})

    if data_profile:
        must_clauses.append({"term": {"data_profile": data_profile}})

    if severity_filter:
        must_clauses.append(
            {"terms": {"severity": severity_filter}}
        )

    # Time window filter on detected_at (epoch_millis or date)
    filter_clauses: List[Dict[str, Any]] = [
        {
            "range": {
                "detected_at": {
                    "gte": f"now-{minutes}m",
                    "lte": "now",
                }
            }
        }
    ]

    body = {
        "size": size,
        "sort": [{"detected_at": {"order": "desc"}}],
        "query": {
            "bool": {
                "must": must_clauses,
                "filter": filter_clauses,
            }
        },
        "aggs": {
            "by_severity": {
                "terms": {"field": "severity"},
            },
            "by_sensor": {
                "terms": {"field": "sensor_code"},
            },
            "by_violation_type": {
                "terms": {"field": "violation_type"},
            },
        },
    }

    index = settings.ES_INDEX
    path = f"{index}/_search"

    logger.debug(
        f"Querying ES index={index}, tenant_key={tenant_key}, sensor_code={sensor_code}, minutes={minutes}"
    )
    return _es_get(path, body)
