# app/api.py
"""
FastAPI HTTP API for genai-service.

Key endpoint:
  POST /genai/insights

Example request body:
{
  "question": "Explain what's happening for potato_wh chamber-01 in last 2h",
  "tenant_key": "potato_wh",
  "sensor_code": "PW-CH1-TEMP-01",
  "metric": "temperature",
  "scenario": "LP1",
  "data_profile": "DP1",
  "time_window": "2h"
}
"""

from typing import Optional, Dict, Any

from fastapi import FastAPI
from pydantic import BaseModel
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST

from .config import get_settings
from .logger import logger
from .graph import genai_app, AgentState

settings = get_settings()

app = FastAPI(title="genai-service", version="1.0.0")


# -------- Metrics --------

GENAI_REQUESTS_TOTAL = Counter(
    "genai_requests_total",
    "Total number of GenAI insight requests",
    ["endpoint"],
)
GENAI_LATENCY_SECONDS = Histogram(
    "genai_latency_seconds",
    "Latency of GenAI insight requests",
    ["endpoint"],
    buckets=(0.1, 0.25, 0.5, 1, 2, 5, 10),
)


class InsightRequest(BaseModel):
    question: str
    tenant_key: str
    sensor_code: Optional[str] = None
    metric: Optional[str] = None
    scenario: Optional[str] = None
    data_profile: Optional[str] = None
    time_window: Optional[str] = None  # e.g., "2h", "30m"


class InsightResponse(BaseModel):
    answer: str
    context: Dict[str, Any]


@app.get("/health")
def health() -> Dict[str, Any]:
    """
    Simple health check endpoint.
    """
    return {
        "status": "ok",
        "service": settings.SERVICE_NAME,
        "env": settings.ENV,
    }


@app.get("/metrics")
def metrics():
    """
    Prometheus metrics endpoint.
    """
    data = generate_latest()
    return (
        data,
        200,
        {"Content-Type": CONTENT_TYPE_LATEST},
    )


@app.post("/genai/insights", response_model=InsightResponse)
def genai_insights(request: InsightRequest):
    """
    Main GenAI endpoint.

    - Builds an initial AgentState
    - Runs it through the LangGraph app
    - Returns the final answer + context so UI can show both.
    """
    GENAI_REQUESTS_TOTAL.labels(endpoint="/genai/insights").inc()
    with GENAI_LATENCY_SECONDS.labels(endpoint="/genai/insights").time():
        logger.info(
            "Received GenAI request: tenant_key=%s, sensor_code=%s, metric=%s, time_window=%s, scenario=%s, data_profile=%s",
            request.tenant_key,
            request.sensor_code,
            request.metric,
            request.time_window,
            request.scenario,
            request.data_profile,
        )

        initial_state: AgentState = {
            "question": request.question,
            "tenant_key": request.tenant_key,
            "sensor_code": request.sensor_code,
            "metric": request.metric,
            "scenario": request.scenario,
            "data_profile": request.data_profile,
            "time_window": request.time_window,
        }

        # genai_app.invoke(...) is sync; there is also .ainvoke for async variants.
        final_state: AgentState = genai_app.invoke(initial_state)

        answer = final_state.get("answer", "")
        context = final_state.get("context", {})

        return InsightResponse(answer=answer, context=context)
