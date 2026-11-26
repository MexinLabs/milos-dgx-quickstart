"""A minimal agent loop over the OpenAI-compatible API.

An agent is a system prompt plus tools. Delegating to another agent is a tool
too (`ask_<agent id>`). Every step emits an event (docs/data-contracts.md), which
is all the UI needs to draw the run.
"""

import json
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from ..events import Run
from ..llm import llm_client, stream_chat, vlm_client
from ..settings import settings

MAX_STEPS = 6


@dataclass
class Tool:
    name: str
    description: str
    fn: Callable[..., Awaitable[Any]]
    parameters: dict = field(default_factory=lambda: {"type": "object", "properties": {}})


@dataclass
class Agent:
    id: str
    label: str
    description: str  # what other agents read when deciding to delegate
    system: str
    tools: list[Tool] = field(default_factory=list)
    delegates: list[str] = field(default_factory=list)
    vision: bool = False  # runs on VLM_MODEL and receives the run's image
    # Receives what the other agents already found, appended to its task. The
    # orchestrator does it so the result does not depend on a model copying text.
    sees_findings: bool = False
    # Its answer is the answer of whoever delegated to it: no extra model call to repeat it.
    answers_for_caller: bool = False


@dataclass
class RunContext:
    run: Run
    agents: dict[str, Agent]
    image_url: str | None = None
    findings: list[tuple[str, str]] = field(default_factory=list)  # (agent label, output)


def _tool_specs(ctx: RunContext, agent: Agent) -> list[dict]:
    specs = [
        {
            "type": "function",
            "function": {"name": t.name, "description": t.description, "parameters": t.parameters},
        }
        for t in agent.tools
    ]
    for target_id in agent.delegates:
        target = ctx.agents[target_id]
        specs.append(
            {
                "type": "function",
                "function": {
                    "name": f"ask_{target_id}",
                    "description": f"Delega una tarea a {target.label}. {target.description}",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "task": {
                                "type": "string",
                                "description": "Qué debe hacer, con todo el contexto que necesita.",
                            }
                        },
                        "required": ["task"],
                    },
                },
            }
        )
    return specs


async def _complete(
    ctx: RunContext, agent: Agent, messages: list[dict], tools: list[dict] | None
) -> tuple[str, list[dict]]:
    """One model call. Returns the text and the tool calls it asked for."""
    client, model = (vlm_client, settings.vlm_model) if agent.vision else (llm_client, settings.llm_model)
    content = ""
    calls: list[dict] = []
    async for event in stream_chat(client, model, messages, tools):
        match event["type"]:
            case "reasoning":
                await ctx.run.emit("llm_delta", agent.id, text=event["text"], kind="reasoning")
            case "delta":
                content += event["text"]
                await ctx.run.emit("llm_delta", agent.id, text=event["text"], kind="answer")
            case "tool_calls":
                calls = event["calls"]
            case "end":
                await ctx.run.emit(
                    "llm_end",
                    agent.id,
                    model=event["model"],
                    usage=event["usage"],
                    ttft_ms=event["ttft_ms"],
                    tokens_per_s=event["tokens_per_s"],
                )
            case "error":
                raise RuntimeError(event["message"])
    return content, calls


async def _dispatch(ctx: RunContext, agent: Agent, call: dict) -> Any:
    """Run one tool call, or hand the task to another agent."""
    name = call["name"]
    try:
        args = json.loads(call["arguments"] or "{}")
    except json.JSONDecodeError:
        args = None

    if name.startswith("ask_") and name[4:] in agent.delegates and isinstance(args, dict):
        target = ctx.agents[name[4:]]
        task = str(args.get("task", ""))
        await ctx.run.emit("handoff", agent.id, to=target.id, task=task)
        output = await run_agent(ctx, target, task, parent=agent.id)
        ctx.findings.append((target.label, output))
        return output

    await ctx.run.emit("tool_call", agent.id, call_id=call["id"], tool=name, args=args)
    start = time.perf_counter()
    tool = next((t for t in agent.tools if t.name == name), None)
    ok = False
    if tool is None:
        result: Any = {"error": f"La herramienta '{name}' no existe."}
    elif not isinstance(args, dict):
        result = {"error": "Los argumentos no son un objeto JSON válido."}
    else:
        try:
            result = await tool.fn(**args)
            ok = True
        except Exception as exc:  # the model sees the error and can react
            result = {"error": f"{type(exc).__name__}: {exc}"}
    await ctx.run.emit(
        "tool_result",
        agent.id,
        call_id=call["id"],
        tool=name,
        ok=ok,
        result=result,
        ms=round((time.perf_counter() - start) * 1000),
    )
    return result


async def run_agent(ctx: RunContext, agent: Agent, task: str, parent: str | None = None) -> str:
    model = settings.vlm_model if agent.vision else settings.llm_model
    await ctx.run.emit("agent_start", agent.id, label=agent.label, model=model, task=task, parent=parent)

    if agent.sees_findings and ctx.findings:
        task += "\n\nHallazgos del equipo:\n" + "\n\n".join(
            f"## {label}\n{output}" for label, output in ctx.findings
        )
    user_content: Any = task
    if agent.vision and ctx.image_url:
        user_content = [
            {"type": "text", "text": task},
            {"type": "image_url", "image_url": {"url": ctx.image_url}},
        ]
    messages: list[dict] = [
        {"role": "system", "content": agent.system},
        {"role": "user", "content": user_content},
    ]
    tools = _tool_specs(ctx, agent)

    output = ""
    for step in range(MAX_STEPS + 1):
        # On the last step no tools are offered, so the model has to answer.
        content, calls = await _complete(ctx, agent, messages, tools if step < MAX_STEPS else None)
        if not calls:
            output = content
            break
        messages.append(
            {
                "role": "assistant",
                "content": content,
                "tool_calls": [
                    {
                        "id": c["id"],
                        "type": "function",
                        "function": {"name": c["name"], "arguments": c["arguments"] or "{}"},
                    }
                    for c in calls
                ],
            }
        )
        final = None
        for call in calls:
            result = await _dispatch(ctx, agent, call)
            target = ctx.agents.get(call["name"].removeprefix("ask_"))
            if call["name"].startswith("ask_") and target and target.answers_for_caller:
                final = result
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": call["id"],
                    "content": result if isinstance(result, str) else json.dumps(result, ensure_ascii=False),
                }
            )
        if isinstance(final, str):
            output = final
            break

    await ctx.run.emit("agent_end", agent.id, output=output)
    return output


async def execute(
    run: Run, scenario_id: str, agents: dict[str, Agent], entry: str, task: str, image_url: str | None
) -> None:
    """Run a scenario to completion. The stream always closes with run_end."""
    start = time.perf_counter()
    ctx = RunContext(run=run, agents=agents, image_url=image_url)
    ok, output = True, ""
    await run.emit("run_start", None, scenario=scenario_id, input=task, has_image=image_url is not None)
    try:
        output = await run_agent(ctx, agents[entry], task)
    except Exception as exc:
        ok = False
        await run.emit("error", None, message=f"{type(exc).__name__}: {exc}")
    await run.emit(
        "run_end", None, ok=ok, output=output, total_ms=round((time.perf_counter() - start) * 1000)
    )
