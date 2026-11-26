# Decisions

## 2026-11-26: Ollama as the model server

Ollama serves both the LLM and the VLM. Its image is published for amd64 and
arm64, so the same compose file runs on the laptop and on any DGX model, it
supports vision and tool calling, and it exposes the OpenAI-compatible API.
vLLM stays as a stretch item for the throughput demo (`nvcr.io/nvidia/vllm`).

## 2026-11-26: one compose file, two env files

`local` and `dgx` run the same services. The difference is model size and
parallelism, which live in `.env.example` and `.env.dgx.example`.

## 2026-11-26: Qwen models, Apache 2.0 only

Qwen3 for text and agents, Qwen3-VL for vision, Qwen3-Next as the large
showcase model. No OpenAI models. Tags, sizes and licenses were checked against
the Ollama registry on this date.

The `-instruct` builds are used wherever one exists: the plain tags (`qwen3:30b`,
`qwen3-vl:32b`) are the thinking builds, which spend hundreds of tokens reasoning
before a short answer and are too slow for a live demo. `qwen3-next:80b` has no
instruct build, so the showcase model does reason before answering.

## 2026-11-26: no agent framework

The orchestrator is a hand-written tool-calling loop. See `agent-demos.md`.

## 2026-11-26: SSE, not WebSockets

All live data flows server to browser only. SSE survives the Vite proxy
without extra configuration and reconnects on its own.

## 2026-11-26: Jupyter on the NGC PyTorch container

`nvcr.io/nvidia/pytorch:26.11-py3` is published for amd64 and arm64 and ships
CUDA and PyTorch built for the host. It is the container NVIDIA documents for DGX.

## 2026-11-26: target is the DGX Spark, session is remote

The target is the DGX Spark (arm64, 128 GB of unified memory). The session is
remote: the presenter runs the stack on a Spark and shares the screen, each
participant runs the same repo on their own, and everyone uses `localhost`.

Consequences:

- Participants build and run the repo themselves, so a clean clone must work
  by following `docs/guia-participante.md` and nothing else.
- Images are built on each Spark (arm64). A laptop only proves the amd64 path.
- GPU memory may not be reported per GPU on unified memory; the GPU panel
  falls back to host memory.

## 2026-11-26: small models by default, larger ones downloaded in stages

A new Spark comes out of the box during the session, so nothing can be
downloaded beforehand. The defaults are the small pair (`qwen3:4b-instruct`,
`qwen3-vl:4b-instruct`, 5.8 GB together) and the machine is serving models
minutes after the first boot. The rest arrives in the background, in the order
the session needs it:

| Stage | Download | Size |
|---|---|---|
| 1 | Ollama image and the two small models | 8.3 GB |
| 2 | Jupyter image (NGC PyTorch, arm64) | 12.9 GB |
| 3 | `qwen3:30b-instruct` for the agents | 18.6 GB |

Sizes are compressed download sizes read from the registries. Larger models
(`qwen3-vl:32b-instruct`, `qwen3-next:80b`) are optional and listed in
`.env.dgx.example`.

Switching to a larger model is a one-line change in `.env`, and an agent run
can also name its model (`model` on `POST /api/agents/runs`), so the same
scenario can be compared across models without restarting anything.

The small models make more mistakes. Two guards in the orchestrator keep the
demo honest with them: findings are passed to the report writer by the
orchestrator, and the data analyst must query the detail before it may answer.

## 2026-11-26: frontend with Tailwind, no component kit, light theme

The UI is React with Tailwind 4 and hand-written components; the only other
runtime dependency is `react-markdown` for model output. No component kit and
no chart library: the graph and the GPU sparkline are plain SVG. Fewer
packages to install on a new machine, and nothing here needs more.

Light theme, large type: the screen is read over a video call, and dark text
on white survives compression better than the reverse.

The frontend runs on the Vite dev server, which proxies `/api`. When the
backend restarts, that proxy can leave an open event stream hanging instead of
closing it, so the GPU panel reconnects on its own after a few seconds of
silence, and an agent run that will never finish can be dropped from the UI.

## Open questions

| Question | Why it matters |
|---|---|
| Is `qwen3-vl:32b` fast enough live on the Spark? | Measure tokens/s on a Spark; fall back to `qwen3-vl:8b` if the vision step drags. |
