"""Model access through the OpenAI-compatible API, with timing for the UI."""

import time
from collections.abc import AsyncIterator

from openai import AsyncOpenAI

from .settings import settings

llm_client = AsyncOpenAI(base_url=settings.llm_base_url, api_key=settings.llm_api_key)
vlm_client = AsyncOpenAI(base_url=settings.vlm_base_url, api_key=settings.vlm_api_key)


def reasoning_options(model: str) -> dict:
    """LLM_REASONING_EFFORT applies to LLM_MODEL only: other models may not accept it."""
    if settings.llm_reasoning_effort and model == settings.llm_model:
        return {"reasoning_effort": settings.llm_reasoning_effort}
    return {}


async def stream_chat(
    client: AsyncOpenAI,
    model: str,
    messages: list[dict],
    tools: list[dict] | None = None,
) -> AsyncIterator[dict]:
    """Yield reasoning and delta chunks, then one end (or error).

    When the model asks for tools, a tool_calls event comes right before end:
    {"type": "tool_calls", "calls": [{"id", "name", "arguments"}]}.
    """
    start = time.perf_counter()
    first_token_at: float | None = None
    chunks = 0
    usage = None
    calls: list[dict] = []
    call_at_index: dict[int, dict] = {}
    try:
        stream = await client.chat.completions.create(
            model=model,
            messages=messages,
            stream=True,
            stream_options={"include_usage": True},
            **({"tools": tools} if tools else {}),
            **reasoning_options(model),
        )
        async for chunk in stream:
            if chunk.usage:
                usage = chunk.usage
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            # Thinking models send their reasoning in a separate, non-standard field.
            reasoning = getattr(delta, "reasoning", None) or getattr(delta, "reasoning_content", None)
            if reasoning or delta.content or delta.tool_calls:
                chunks += 1
                if first_token_at is None:
                    first_token_at = time.perf_counter()
            if reasoning:
                yield {"type": "reasoning", "text": reasoning}
            if delta.content:
                yield {"type": "delta", "text": delta.content}
            for fragment in delta.tool_calls or []:
                call = call_at_index.get(fragment.index)
                # A new id on a known index is a new call: some servers reuse index 0.
                if call is None or (fragment.id and call["id"] and fragment.id != call["id"]):
                    call = {"id": fragment.id or "", "name": "", "arguments": ""}
                    call_at_index[fragment.index] = call
                    calls.append(call)
                if fragment.id:
                    call["id"] = fragment.id
                if fragment.function:
                    if fragment.function.name:
                        call["name"] = fragment.function.name
                    if fragment.function.arguments:
                        call["arguments"] += fragment.function.arguments
    except Exception as exc:  # surfaced to the UI instead of a broken stream
        yield {"type": "error", "message": f"{type(exc).__name__}: {exc}"}
        return

    if calls:
        yield {"type": "tool_calls", "calls": calls}

    end = time.perf_counter()
    completion_tokens = usage.completion_tokens if usage else None
    # A tool call can arrive as one chunk at the very end; then only the total time is meaningful.
    generation_s = (end - first_token_at) if chunks > 1 else (end - start)
    yield {
        "type": "end",
        "model": model,
        "usage": {
            "prompt_tokens": usage.prompt_tokens if usage else None,
            "completion_tokens": completion_tokens,
        },
        "ttft_ms": round((first_token_at - start) * 1000) if first_token_at else None,
        "total_ms": round((end - start) * 1000),
        "tokens_per_s": round(completion_tokens / generation_s, 1)
        if completion_tokens and generation_s
        else None,
    }
