# main.py
"""
Entrypoint for genai-service.

Run with:
  python main.py
or in Docker via `uvicorn app.api:app`.
"""

import uvicorn
from app.config import get_settings
from app.logger import logger


def main():
    settings = get_settings()
    logger.info(
        "Starting genai-service on port %s in %s mode",
        settings.PORT,
        settings.ENV,
    )

    uvicorn.run(
        "app.api:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=settings.ENV == "development",
    )


if __name__ == "__main__":
    main()
