# app/config.py
"""
Configuration module for genai-service.

All connection details are controlled via environment variables with sensible
defaults for local development. In Docker, you'll override the hostnames to use
kafka-net service names (postgres, elasticsearch).
"""

import os
from functools import lru_cache


class Settings:
    # Basic service info
    SERVICE_NAME: str = os.getenv("SERVICE_NAME", "genai")
    ENV: str = os.getenv("NODE_ENV", "development")
    PORT: int = int(os.getenv("PORT", "4100"))

    # Postgres (read-only for analytics)
    PG_HOST: str = os.getenv("PG_HOST", "localhost")
    PG_PORT: int = int(os.getenv("PG_PORT", "5432"))
    PG_DB: str = os.getenv("PG_DB", "coldstore")
    PG_USER: str = os.getenv("PG_USER", "coldstore")
    PG_PASSWORD: str = os.getenv("PG_PASSWORD", "coldstore")

    # Elasticsearch
    ES_URL: str = os.getenv("ES_URL", "http://localhost:9200")
    ES_INDEX: str = os.getenv("ES_INDEX", "coldstore-detected-events")

    # LLM (OpenAI as default; you can swap to any provider)
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")

    # Misc
    DEFAULT_TIME_WINDOW_MINUTES: int = int(os.getenv("DEFAULT_TIME_WINDOW_MINUTES", "120"))


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    # Using @lru_cache so we only construct once per process.
    return Settings()
