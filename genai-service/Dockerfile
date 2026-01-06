FROM python:3.11-slim

# Avoid Python bytecode & buffering
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /usr/src/app

# Install OS deps (psycopg2 needs build deps + libpq)
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app code
COPY app ./app
COPY main.py .

# Default envs (override in docker-compose)
ENV SERVICE_NAME=genai
ENV NODE_ENV=production
ENV PORT=4100

CMD ["python", "main.py"]
