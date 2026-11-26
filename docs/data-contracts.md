# Data contracts

The frontend, the backend and the notebooks are built in parallel against this
file. Change it here first, then in code.

## Model endpoints

Every model is reached through an OpenAI-compatible API (`/v1/chat/completions`).
The backend and the notebooks read the same variables:

| Variable | Meaning |
|---|---|
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | text model; also drives the agents (tool calling) |
| `LLM_REASONING_EFFORT` | optional: `low`, `medium` or `high` for a reasoning `LLM_MODEL`; empty otherwise |
| `VLM_BASE_URL`, `VLM_API_KEY`, `VLM_MODEL` | vision model (image + text in, text out) |

## Backend HTTP API

All streaming endpoints use Server-Sent Events (SSE): one JSON object per `data:` line.

| Method | Path | Purpose | Status |
|---|---|---|---|
| GET | `/api/health` | liveness | done |
| GET | `/api/config` | client name and model names for the UI header | done |
| GET | `/api/models` | `{models: [...]}`: every model on the server, for the model picker | done |
| POST | `/api/chat` | body `{messages, model?}`; streams `chat` events. `model` defaults to `LLM_MODEL` | done |
| POST | `/api/vision` | multipart `image` + `prompt`; streams `chat` events from `VLM_MODEL` | done |
| GET | `/api/gpu/stream` | streams one `gpu` sample per second | done |
| GET | `/api/agents/scenarios` | `{scenarios: [...]}`: each with the graph it draws and example questions | done |
| POST | `/api/agents/runs` | multipart `scenario`, `input`, optional `image` and optional `model` (text model for this run, default `LLM_MODEL`); returns `{run_id}` | done |
| GET | `/api/agents/runs/{run_id}/events` | streams `agent` events from `seq` 0, then live, and closes after `run_end` | done |

### `chat` event

```json
{"type": "reasoning", "text": "El usuario saluda…"}
{"type": "delta", "text": "Hola"}
{"type": "end", "model": "qwen3:30b-instruct", "usage": {"prompt_tokens": 42, "completion_tokens": 180}, "ttft_ms": 210, "total_ms": 3140, "tokens_per_s": 61.4}
{"type": "error", "message": "APIConnectionError: Connection error."}
```

- `reasoning` carries a thinking model's reasoning; the UI shows it dimmed or
  collapsed, apart from the answer.
- A stream ends with exactly one `end` or one `error`.
- `completion_tokens` and `tokens_per_s` include reasoning tokens.
  `tokens_per_s` is measured from the first token, so it excludes model load time.

### `gpu` sample

```json
{
  "ts": "2026-11-27T10:15:02.120Z",
  "gpus": [
    {"index": 0, "name": "…", "util_pct": 87, "mem_used_mb": 41200, "mem_total_mb": 81559, "temp_c": 64, "power_w": 310}
  ],
  "host": {"mem_used_mb": 52000, "mem_total_mb": 128000}
}
```

`mem_used_mb` and `mem_total_mb` may be `null` per GPU on unified-memory systems
that do not report them; the UI then shows `host` memory instead.

### `agent` event

One envelope for everything the agents view draws (graph, timeline, token stream):

```json
{"run_id": "r_8f2c", "seq": 12, "ts": "2026-11-27T10:15:02.120Z", "type": "tool_call", "agent": "data_analyst", "data": {}}
```

| `type` | `data` | What the UI does |
|---|---|---|
| `run_start` | `{scenario, input, has_image, model}` | resets the graph |
| `agent_start` | `{label, model, task, parent}` | lights the agent node; `parent` is the agent that delegated, or `null` |
| `llm_delta` | `{text, kind}` | appends to the agent's stream; `kind` is `answer` or `reasoning` |
| `llm_end` | `{model, usage, ttft_ms, tokens_per_s}` | updates the tokens/s counter |
| `tool_call` | `{call_id, tool, args}` | lights the tool node, animates the agent-to-tool edge |
| `tool_result` | `{call_id, tool, ok, result, ms}` | shows the result (expandable) and the duration |
| `handoff` | `{to, task}` | animates the agent-to-agent edge |
| `agent_retry` | `{reason}` | the agent's answer so far is discarded (it answered before using its tools enough); clears its stream |
| `agent_end` | `{output}` | dims the agent node |
| `error` | `{message}` | marks the run as failed; `agent` is `null` |
| `run_end` | `{ok, output, total_ms}` | shows the final answer; always the last event |

`agent` is `null` on `run_start`, `error` and `run_end`. `seq` starts at 0 and
increases by one, so the UI can order events and detect gaps. A model step that
only asks for tools has no `llm_delta`, just `llm_end` followed by `tool_call`
or `handoff`.

### Scenario definition (`/api/agents/scenarios`)

The graph layout is declared by the scenario, not computed in the browser:

```json
{
  "id": "shift_inspector",
  "title": "Inspector de turno",
  "description": "Un supervisor reparte el trabajo…",
  "needs_image": true,
  "examples": ["¿Hay algo que deba atender antes del siguiente turno?"],
  "nodes": [
    {"id": "supervisor", "kind": "agent", "label": "Supervisor", "x": 0, "y": 1},
    {"id": "query_production", "kind": "tool", "label": "SQL producción", "x": 2, "y": 2}
  ],
  "edges": [["supervisor", "vision_inspector"], ["data_analyst", "query_production"]]
}
```
