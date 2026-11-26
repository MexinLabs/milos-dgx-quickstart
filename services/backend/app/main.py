"""milOS DGX Quickstart backend.

Contracts are in docs/data-contracts.md.
"""

import asyncio
import base64
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from . import gpu
from .agents import sample_data
from .agents.orchestrator import execute
from .agents.scenarios import SCENARIOS
from .events import create_run, get_run
from .llm import llm_client, stream_chat, vlm_client
from .settings import settings


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    sample_data.build()
    yield


app = FastAPI(title="milOS DGX Quickstart", lifespan=lifespan)

# Keeps a reference to running agent tasks so they are not garbage collected.
_agent_tasks: set[asyncio.Task] = set()


def sse(events: AsyncIterator[dict]) -> StreamingResponse:
    async def body() -> AsyncIterator[str]:
        async for event in events:
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        body(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def to_data_url(image: UploadFile) -> str:
    encoded = base64.b64encode(await image.read()).decode()
    return f"data:{image.content_type or 'image/jpeg'};base64,{encoded}"


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/config")
def config() -> dict:
    return {
        "client_name": settings.client_name,
        "llm_model": settings.llm_model,
        "vlm_model": settings.vlm_model,
    }


@app.get("/api/models")
async def models() -> dict:
    """Models available on the server, so the UI can offer the showcase model."""
    listing = await llm_client.models.list()
    return {"models": sorted(m.id for m in listing.data)}


class ChatRequest(BaseModel):
    messages: list[dict]
    model: str | None = None


@app.post("/api/chat")
async def chat(request: ChatRequest) -> StreamingResponse:
    return sse(stream_chat(llm_client, request.model or settings.llm_model, request.messages))


@app.post("/api/vision")
async def vision(image: UploadFile = File(...), prompt: str = Form(...)) -> StreamingResponse:
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": await to_data_url(image)}},
            ],
        }
    ]
    return sse(stream_chat(vlm_client, settings.vlm_model, messages))


@app.get("/api/gpu/stream")
async def gpu_stream() -> StreamingResponse:
    async def samples() -> AsyncIterator[dict]:
        while True:
            yield gpu.sample()
            await asyncio.sleep(1)

    return sse(samples())


@app.get("/api/agents/scenarios")
def agent_scenarios() -> dict:
    return {"scenarios": [scenario.public() for scenario in SCENARIOS.values()]}


@app.post("/api/agents/runs")
async def create_agent_run(
    scenario: str = Form(...),
    input: str = Form(...),
    image: UploadFile | None = File(None),
) -> dict:
    spec = SCENARIOS.get(scenario)
    if spec is None:
        raise HTTPException(404, f"Escenario desconocido: {scenario}")
    if spec.needs_image and image is None:
        raise HTTPException(400, "Este escenario necesita una imagen.")

    run = create_run()
    image_url = await to_data_url(image) if image else None
    task = asyncio.create_task(execute(run, spec.id, spec.build(), spec.entry, input, image_url))
    _agent_tasks.add(task)
    task.add_done_callback(_agent_tasks.discard)
    return {"run_id": run.id}


@app.get("/api/agents/runs/{run_id}/events")
async def agent_run_events(run_id: str) -> StreamingResponse:
    run = get_run(run_id)
    if run is None:
        raise HTTPException(404, f"Corrida desconocida: {run_id}")
    return sse(run.stream())
