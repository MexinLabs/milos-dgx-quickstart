# Agent orchestration demos

Goal: the audience watches agents, tools and hand-offs light up as they happen,
next to the GPU load they cause. Every scenario runs on the same small
orchestrator and emits the `agent` events defined in `data-contracts.md`.

## Orchestrator

A hand-written loop over the OpenAI-compatible API (the `openai` Python SDK),
about 200 lines, no agent framework:

1. Call the model with the agent's system prompt, the conversation and its tools.
2. If the model asks for tools, run them, append the results, go to 1.
3. A hand-off is a tool too (`ask_<agent id>(task)`): the supervisor calls it and
   the target agent runs its own loop.
4. Each step publishes an event to an in-memory log keyed by `run_id`; the SSE
   endpoint replays it.

Two things are done by the orchestrator instead of being left to the model,
because a small model gets them wrong and a live demo cannot:

- An agent marked `sees_findings` receives what the other agents already
  produced, appended to its task. Without it the report writer was handed a
  one-line task and invented the findings.
- An agent marked `answers_for_caller` ends the run of whoever delegated to
  it. Without it the supervisor repeated the whole report token by token.

Code: `services/backend/app/agents/` (`orchestrator.py`, `scenarios.py`, `tools.py`).

Why no framework: fewer things to break in a live session, and the same loop is what
notebook 03 teaches, so the UI shows exactly what the audience just wrote.

## Scenarios

### A. DGX Ops Copilot (build first)

One agent with read-only tools about the machine it runs on.

- Tools: `gpu_status` (NVML), `list_models` (Ollama), `disk_usage`, `list_containers`.
- Questions: "¿Qué modelos están cargados y cuánta memoria usan?", "¿Me cabe
  otro modelo de 20 GB?", "¿Qué contenedores están corriendo?"
- Why: it continues the setup session (the agent answers what the audience just
  checked by hand) and it is the smallest thing that exercises the whole
  event pipeline.
- `list_containers` needs the Docker socket mounted read-only into the backend.
  That gives the backend visibility of the host's containers; acceptable on a
  workshop machine, not something to leave in a product.

### B. Inspector de turno (main demo)

Supervisor with three specialists. One run uses the LLM, the VLM and tools.

```
supervisor ──► vision_inspector ──► (VLM) describes the line photo, lists findings
           ──► data_analyst     ──► query_production (SQL over synthetic shift data)
           ──► report_writer    ──► shift report in Spanish
```

- Input: a photo of a production line or a safety scene, plus a question such
  as "¿Hay algo que deba atender antes del siguiente turno?"
- Data: a synthetic SQLite database (production, scrap and downtime per shift,
  line and day), rebuilt under `data/` at every backend start. One problem is
  planted for the analyst to find: line L2, night shift, scrap and downtime
  rising over the last four days.
- The photo is uploaded by whoever runs the demo; the repo ships none yet.
- Why: it is the Physical AI story in one screen: see, check the data, decide.

### C. Panel de expertos en paralelo (if time allows)

Fan-out and join: three specialists (calidad, mantenimiento, seguridad) answer
the same question at the same time, then a synthesizer merges them.

- Why: three token streams side by side while GPU utilization jumps is the
  clearest picture of what the DGX buys: concurrency, not just one fast chat.
- Cost: no new tools, only `asyncio.gather` in the orchestrator and three
  columns in the UI. Needs `OLLAMA_NUM_PARALLEL` >= 3.

### D. RAG over the DGX manual (not planned)

Retriever, writer and critic. It needs an embedding model, an index and
document preparation; too many moving parts for one day.

## What the screen shows

| View | Content |
|---|---|
| Graph | agents and tools as nodes (fixed layout from the scenario, plain SVG); the active node pulses, edges animate on tool calls and hand-offs |
| Timeline | ordered steps with duration; tool arguments and results expand on click |
| Stream | the active agent's tokens as they arrive |
| GPU panel | utilization, memory and tokens/s, always visible on every tab |
| Model picker | every model on the server; the chat and the next agent run use the one selected |
| Past runs | the runs of this browser session, by model and duration; a click replays one from the backend's event log |

Code: `services/frontend/src/` (`lib/agentRun.ts` turns the events into the
state every view draws; `components/AgentGraph.tsx`, `components/AgentTimeline.tsx`).
