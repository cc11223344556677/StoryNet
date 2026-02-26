# StoryNet

Monorepo containing:

- `backend` (OpenAPI + data services integration)
- `frontend` (React + Vite SPA, served by nginx)
- `ner_service`
- `pdf_service`
- Kubernetes manifests under `manifests/`

## Frontend

The canonical frontend now lives in `frontend/` and builds to the `frontend:latest` image used by `manifests/frontend.yaml`.

Frontend routing/proxy behavior:

- SPA app routes are served with `try_files ... /index.html`.
- `/api` proxies to `http://angles-server.ddns.net:5001` by default for local Docker runs.
- Kubernetes deploys override the frontend container `API_UPSTREAM` to `backend-service.app.svc.cluster.local:8080`.
- `/ner` and `/pdf` nginx passthrough routes are retained for repo compatibility.

## Main Paths

- `/api` for backend API
- `/ner` for NER service path passthrough
- `/pdf` for PDF service path passthrough

## Build/Deploy Script

`rebuild.sh` builds images from repo subfolders and restarts deployments in namespace `app`.

## Local Frontend Quickstart

```powershell
docker build -t frontend:latest ./frontend
docker run -d --rm --name storynet-frontend-local -p 8080:80 frontend:latest
```

Open:

- `http://localhost:8080/`

## Auth 405 Troubleshooting

If login/register returns `405`, verify the frontend nginx `/api` proxy preserves the `/api` prefix:

- correct: `proxy_pass http://${API_UPSTREAM};`
- incorrect: `proxy_pass http://${API_UPSTREAM}/;` (this strips `/api` and can route auth calls to `/auth/*`)
