# dashboard-ui

React dashboard for cold storage status. Uses dashboard-api for data and
WebSocket updates, and provides a GenAI chat panel.

## Environment variables
See `.env.example`:
- `VITE_API_BASE_URL` (default: `http://localhost:4200/api`)
- `VITE_WS_URL` (default: `ws://localhost:4200/ws`)
- `VITE_API_TOKEN` (default: `dev-token`)
- `VITE_DEFAULT_TENANT_KEY` (default: `potato_wh`)

## Run locally
```powershell
npm install
npm run dev
```

## Build
```powershell
npm run build
npm run preview
```

## Docker
Use `ingest-api/docker-compose.kafka.yml`. The UI is served on port 4300.
