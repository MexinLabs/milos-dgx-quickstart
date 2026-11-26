# Ports

| Port | Service | Used by |
|---|---|---|
| 5173 | frontend (Vite dev server) | the audience's browser; proxies `/api` to the backend |
| 8000 | backend (FastAPI) | frontend proxy; `http://<host>:8000/docs` for the API explorer |
| 8888 | JupyterLab | browser; token is `JUPYTER_TOKEN` |
| 11434 | Ollama | backend and notebooks (`/v1` is the OpenAI-compatible API) |

Inside the compose network, services reach each other by name
(`http://ollama:11434`, `http://backend:8000`).

`scripts/00-preflight.sh` checks that these ports are free.
