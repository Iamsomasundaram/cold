# app/llm_client.py
"""
Minimal LLM client for genai-service.

Uses the OpenAI Python library. You can plug in any provider by changing this
module; the rest of the service calls `generate_insight_answer(...)`.
"""

from typing import Dict, List
from openai import OpenAI

from .config import get_settings
from .logger import logger

settings = get_settings()

# Create a global client; relies on OPENAI_API_KEY env var
client = OpenAI(api_key=settings.OPENAI_API_KEY) if settings.OPENAI_API_KEY else None


def generate_insight_answer(
    question: str,
    violations_summary: Dict,
    thresholds: Dict | None,
    fallback_notes: List[str] | None = None,
) -> str:
    """
    Call the LLM to produce a natural-language explanation of what's happening.

    We keep the prompt simple for now; you can iterate on this later.
    """

    if client is None:
        # Developer-friendly error: you're running without an API key.
        logger.warning("OPENAI_API_KEY is not set; returning stub answer.")
        return (
            "LLM is not configured (missing OPENAI_API_KEY). "
            "Here is a raw summary for now:\n"
            f"- question: {question}\n"
            f"- violations_summary keys: {list(violations_summary.keys())}\n"
            f"- thresholds present: {bool(thresholds)}\n"
        )

    system_prompt = (
        "You are a monitoring and anomaly analysis assistant for a cold-storage "
        "telemetry system. You receive structured JSON summaries of recent "
        "violations from Elasticsearch and threshold rules from Postgres. "
        "Your job is to:\n"
        "1) Explain what's happening in plain language.\n"
        "2) Highlight key patterns (spikes, clusters, recurring sensors).\n"
        "3) Suggest 2-4 practical next actions.\n"
        "Be concise but clear. Avoid guessing beyond the data."
    )

    user_prompt = (
        f"User question:\n{question}\n\n"
        "Violations summary (JSON):\n"
        f"{violations_summary}\n\n"
        "Threshold rule (if any):\n"
        f"{thresholds}\n\n"
    )

    if fallback_notes:
        user_prompt += f"Extra notes:\n{fallback_notes}\n\n"

    response = client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.3,
    )

    return response.choices[0].message.content.strip()
