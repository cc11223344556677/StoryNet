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
- `/api` proxies to the public backend by default: `http://angles-server.ddns.net:5001`.
- `/ner` and `/pdf` nginx passthrough routes are retained for repo compatibility.

## Main Paths

- `/api` for backend API
- `/ner` for NER service path passthrough
- `/pdf` for PDF service path passthrough

## Build/Deploy Script

`rebuild.sh` builds images from repo subfolders and restarts deployments in namespace `app`.
