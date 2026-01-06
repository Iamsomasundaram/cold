# genai-service

FastAPI service that answers GenAI questions by querying Elasticsearch
(and Postgres for reference metadata).

## Endpoints
- `GET /health`
- `GET /metrics`
- `POST /genai/insights`

## Sample request
```json
{
  "question": "Summarize critical violations in the last 2h",
  "tenant_key": "potato_wh",
  "sensor_code": "PW-CH1-TEMP-01",
  "metric": "temperature",
  "scenario": "LP2",
  "data_profile": "DP2",
  "time_window": "2h"
}
```

## Environment variables
- `SERVICE_NAME` (default: `genai`)
- `NODE_ENV` (default: `development`)
- `PORT` (default: 4100)
- `PG_HOST` (default: `localhost`)
- `PG_PORT` (default: 5432)
- `PG_DB` (default: `coldstore`)
- `PG_USER` (default: `coldstore`)
- `PG_PASSWORD` (default: `coldstore`)
- `ES_URL` (default: `http://localhost:9200`)
- `ES_INDEX` (default: `coldstore-detected-events`)
- `OPENAI_API_KEY` (required)
- `OPENAI_MODEL` (default: `gpt-4.1-mini`)
- `DEFAULT_TIME_WINDOW_MINUTES` (default: 120)

## Run locally
```powershell
pip install -r requirements.txt
python main.py
```

## Docker
Use `ingest-api/docker-compose.kafka.yml`. The service runs on port 4100.
