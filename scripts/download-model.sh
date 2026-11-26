#!/usr/bin/env bash
# Pull the models named in .env into this repo's own Ollama volume.
# The defaults are the small models (about 6 GB); larger ones are listed in .env.dgx.example.
#
#   ./scripts/download-model.sh              pulls LLM_MODEL and VLM_MODEL
#   ./scripts/download-model.sh qwen3:30b-instruct   pulls only the models given as arguments

set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "Missing .env: copy .env.example (laptop) or .env.dgx.example (DGX) to .env first." >&2
  exit 1
fi

read_env() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- || true; }

if (( $# > 0 )); then
  MODELS=("$@")
else
  MODELS=()
  for var in LLM_MODEL VLM_MODEL; do
    value="$(read_env "$var")"
    [[ -n "$value" ]] && MODELS+=("$value")
  done
fi

docker compose up -d --wait ollama

for model in "${MODELS[@]}"; do
  echo "==> Pulling $model"
  docker compose exec ollama ollama pull "$model"
done

echo
docker compose exec ollama ollama list
