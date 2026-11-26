# milOS DGX Quickstart

Hands-on workshop for a new NVIDIA DGX Spark: verify the machine, then run a
local LLM, a VLM, GPU notebooks and an agent demo with live visualization.

Participants: follow [docs/guia-participante.md](docs/guia-participante.md) (Spanish).

## Requirements

An NVIDIA GPU host with the NVIDIA driver, Docker, the Compose plugin and the
NVIDIA Container Toolkit. Check it with:

```bash
./scripts/00-preflight.sh          # quick
./scripts/00-preflight.sh --deep   # also runs nvidia-smi inside a container
```

## Run

```bash
# 1. Pick the settings for this machine
cp .env.dgx.example .env    # on the DGX
cp .env.example .env        # on a laptop (small models)

# 2. Download the models named in .env (the defaults are small: about 6 GB)
./scripts/download-model.sh

# 3. Start everything (the Jupyter image is a 13 GB download)
docker compose up -d --build
```

To get a UI quickly and leave Jupyter for later, start with
`docker compose up -d --build ollama backend frontend`.
Larger models are listed in `.env.dgx.example`; download one with
`./scripts/download-model.sh <model>` and set it in `.env`.

| What | URL |
|---|---|
| Web UI | http://localhost:5173 |
| JupyterLab | http://localhost:8888 (token: `JUPYTER_TOKEN` in `.env`) |
| Backend API explorer | http://localhost:8000/docs |
| Model server (OpenAI-compatible) | http://localhost:11434/v1 |

From another machine, replace `localhost` with the DGX hostname or IP.

Stop with `docker compose down`. Models stay in the `ollama-models` volume.

## Docs

- [docs/guia-participante.md](docs/guia-participante.md): preparation and steps for participants
- [docs/agenda.md](docs/agenda.md): workshop agenda
- [docs/agent-demos.md](docs/agent-demos.md): agent scenarios
- [docs/data-contracts.md](docs/data-contracts.md): API and event schemas
- [docs/decisions.md](docs/decisions.md): design decisions
- [docs/ports.md](docs/ports.md): ports
