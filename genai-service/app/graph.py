# app/graph.py
"""
LangGraph graph definition for genai-service.

We keep the state small and explicit:
  - question: the raw user question
  - tenant_key: tenant identifier (required)
  - sensor_code: optional sensor identifier
  - metric: optional metric name (temperature, humidity, etc.)
  - scenario: optional scenario label (LP1, steady, etc.)
  - data_profile: optional data profile label (DP1, DP2, etc.)
  - time_window: string like "2h" or "30m"
  - context: retrieved data (violations, thresholds)
  - answer: final LLM answer
"""

from typing import Optional, Dict, Any, TypedDict

from langgraph.graph import StateGraph, END

from .logger import logger
from .tools import tool_fetch_violations, tool_fetch_threshold
from .llm_client import generate_insight_answer


class AgentState(TypedDict, total=False):
    question: str
    tenant_key: str
    sensor_code: Optional[str]
    metric: Optional[str]
    scenario: Optional[str]
    data_profile: Optional[str]
    time_window: Optional[str]
    context: Dict[str, Any]
    answer: str


def node_retrieve_context(state: AgentState) -> AgentState:
    """
    Graph node: retrieve relevant data from ES + PG.

    This is where we call our 'tools' and attach their results to the state.
    """
    question = state.get("question", "")
    tenant_key = state.get("tenant_key")
    sensor_code = state.get("sensor_code")
    metric = state.get("metric")
    scenario = state.get("scenario")
    data_profile = state.get("data_profile")
    time_window = state.get("time_window")

    logger.debug(
        "Retrieval node: tenant_key=%s, sensor_code=%s, metric=%s, time_window=%s, question=%s",
        tenant_key,
        sensor_code,
        metric,
        time_window,
        question,
    )

    violations_summary = tool_fetch_violations(
        tenant_key=tenant_key,
        sensor_code=sensor_code,
        metric=metric,
        scenario=scenario,
        data_profile=data_profile,
        time_window=time_window,
    )
    threshold_info = tool_fetch_threshold(
        tenant_key=tenant_key,
        sensor_code=sensor_code or None,
        metric=metric,
    )

    state["context"] = {
        "violations": violations_summary,
        "threshold": threshold_info,
    }
    return state


def node_generate_answer(state: AgentState) -> AgentState:
    """
    Graph node: call the LLM to synthesize an answer from retrieved context.
    """
    question = state.get("question", "")
    context = state.get("context") or {}
    violations_summary = context.get("violations", {})
    threshold_info = context.get("threshold")

    logger.debug("Generate node: building LLM answer")

    answer = generate_insight_answer(
        question=question,
        violations_summary=violations_summary,
        thresholds=threshold_info,
        fallback_notes=None,
    )

    state["answer"] = answer
    return state


# Build the graph once at import time
graph_builder = StateGraph(AgentState)
graph_builder.add_node("retrieve_context", node_retrieve_context)
graph_builder.add_node("generate_answer", node_generate_answer)

graph_builder.set_entry_point("retrieve_context")
graph_builder.add_edge("retrieve_context", "generate_answer")
graph_builder.add_edge("generate_answer", END)

# Compiled graph object; this is what the API will call.
genai_app = graph_builder.compile()
