# app/logger.py
"""
Logger for genai-service.

Using the standard logging module for simplicity; if you want pino-style logs
you can wire in structlog/loguru later.
"""

import logging
from .config import get_settings

settings = get_settings()

logger = logging.getLogger(settings.SERVICE_NAME)
logger.setLevel(logging.INFO if settings.ENV != "development" else logging.DEBUG)

# Console handler
ch = logging.StreamHandler()
ch.setLevel(logging.DEBUG)

formatter = logging.Formatter(
    fmt="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
ch.setFormatter(formatter)

if not logger.handlers:
    logger.addHandler(ch)
