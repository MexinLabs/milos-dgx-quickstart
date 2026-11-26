// State of one agent run, rebuilt from the `agent` events in docs/data-contracts.md.
// The graph, the timeline and the token stream are all drawn from this.

import { useCallback, useEffect, useReducer, useRef } from "react";
import { errorText, sse, type AgentEvent } from "./api";
import { reportEnd, reportToken, steadyRate } from "./metrics";

export type AgentView = {
  id: string;
  label: string;
  model: string;
  status: "running" | "waiting" | "done";
  answer: string;
  reasoning: string;
  tokens: number;
  tokensPerS: number | null;
  startedAt: number;
};

export type ToolView = { calls: number; pending: number; failed: boolean; lastMs: number | null };

/** Keyed "from>to". `count` goes up on every tool call or hand-off along the edge. */
export type EdgeView = { count: number; active: boolean };

export type Step =
  | { kind: "agent_start"; seq: number; agent: string; depth: number; label: string; model: string; task: string }
  | {
      kind: "tool";
      seq: number;
      agent: string;
      depth: number;
      callId: string;
      tool: string;
      args: unknown;
      done: boolean;
      ok: boolean;
      result: unknown;
      ms: number | null;
    }
  | { kind: "handoff"; seq: number; agent: string; depth: number; to: string; task: string }
  | { kind: "retry"; seq: number; agent: string; depth: number; reason: string }
  | { kind: "agent_end"; seq: number; agent: string; depth: number; ms: number; tokens: number; tokensPerS: number | null }
  | { kind: "error"; seq: number; agent: null; depth: 0; message: string };

export type RunState = {
  runId: string | null;
  status: "idle" | "running" | "done" | "failed";
  lastSeq: number;
  scenario: string | null;
  input: string;
  model: string | null;
  agents: Record<string, AgentView>;
  tools: Record<string, ToolView>;
  edges: Record<string, EdgeView>;
  /** Agents that started and have not ended, deepest last. */
  stack: string[];
  /** The agent whose text is on screen: the last one that wrote. */
  writer: string | null;
  steps: Step[];
  output: string;
  totalMs: number | null;
  tokens: number;
  error: string | null;
};

export const idleRun: RunState = {
  runId: null,
  status: "idle",
  lastSeq: -1,
  scenario: null,
  input: "",
  model: null,
  agents: {},
  tools: {},
  edges: {},
  stack: [],
  writer: null,
  steps: [],
  output: "",
  totalMs: null,
  tokens: 0,
  error: null,
};

type Action =
  | { type: "follow"; runId: string }
  | { type: "events"; events: AgentEvent[] }
  | { type: "lost"; runId: string; message: string }
  | { type: "clear" };

const edgeKey = (from: string, to: string) => `${from}>${to}`;

function apply(state: RunState, event: AgentEvent): RunState {
  if (event.run_id !== state.runId || event.seq <= state.lastSeq) return state;
  const next: RunState = { ...state, lastSeq: event.seq };
  const { agent: id, data } = event;
  const ts = Date.parse(event.ts);
  const depth = id ? Math.max(0, state.stack.lastIndexOf(id)) : 0;
  const patchAgent = (agentId: string, patch: Partial<AgentView>) => {
    const current = next.agents[agentId];
    if (current) next.agents = { ...next.agents, [agentId]: { ...current, ...patch } };
  };
  const patchEdge = (key: string, patch: (edge: EdgeView) => EdgeView) => {
    next.edges = { ...next.edges, [key]: patch(next.edges[key] ?? { count: 0, active: false }) };
  };

  switch (event.type) {
    case "run_start":
      next.scenario = data.scenario;
      next.input = data.input;
      next.model = data.model;
      break;

    case "agent_start": {
      if (!id) break;
      const parent = state.stack.at(-1);
      if (parent) patchAgent(parent, { status: "waiting" });
      next.agents = {
        ...next.agents,
        [id]: {
          id,
          label: data.label,
          model: data.model,
          status: "running",
          answer: "",
          reasoning: "",
          tokens: 0,
          tokensPerS: null,
          startedAt: ts,
        },
      };
      next.stack = [...state.stack, id];
      next.steps = [
        ...state.steps,
        {
          kind: "agent_start",
          seq: event.seq,
          agent: id,
          depth: state.stack.length,
          label: data.label,
          model: data.model,
          task: data.task,
        },
      ];
      break;
    }

    case "llm_delta": {
      if (!id) break;
      const current = next.agents[id];
      if (!current) break;
      const field = data.kind === "reasoning" ? "reasoning" : "answer";
      patchAgent(id, { [field]: current[field] + data.text });
      next.writer = id;
      break;
    }

    case "llm_end": {
      if (!id) break;
      const current = next.agents[id];
      const tokens = data.usage?.completion_tokens ?? 0;
      if (current) {
        const rate = steadyRate(data.tokens_per_s, tokens);
        patchAgent(id, { tokens: current.tokens + tokens, tokensPerS: rate ?? current.tokensPerS });
      }
      next.tokens = state.tokens + tokens;
      break;
    }

    case "tool_call": {
      if (!id) break;
      const tool = next.tools[data.tool] ?? { calls: 0, pending: 0, failed: false, lastMs: null };
      next.tools = { ...next.tools, [data.tool]: { ...tool, calls: tool.calls + 1, pending: tool.pending + 1 } };
      patchEdge(edgeKey(id, data.tool), (edge) => ({ count: edge.count + 1, active: true }));
      // The text written before a tool call was a thought, not the answer.
      patchAgent(id, { answer: "", reasoning: "" });
      next.steps = [
        ...state.steps,
        {
          kind: "tool",
          seq: event.seq,
          agent: id,
          depth: depth + 1,
          callId: data.call_id,
          tool: data.tool,
          args: data.args,
          done: false,
          ok: false,
          result: null,
          ms: null,
        },
      ];
      break;
    }

    case "tool_result": {
      if (!id) break;
      const tool = next.tools[data.tool];
      if (tool) {
        const pending = Math.max(0, tool.pending - 1);
        next.tools = {
          ...next.tools,
          [data.tool]: { ...tool, pending, failed: tool.failed || !data.ok, lastMs: data.ms },
        };
        if (pending === 0) patchEdge(edgeKey(id, data.tool), (edge) => ({ ...edge, active: false }));
      }
      // Matched from the end: a small model can reuse a call id within a run.
      const index = state.steps.findLastIndex(
        (step) => step.kind === "tool" && !step.done && step.callId === data.call_id && step.tool === data.tool,
      );
      if (index >= 0) {
        next.steps = state.steps.slice();
        next.steps[index] = {
          ...(state.steps[index] as Extract<Step, { kind: "tool" }>),
          done: true,
          ok: data.ok,
          result: data.result,
          ms: data.ms,
        };
      }
      break;
    }

    case "handoff":
      if (!id) break;
      patchEdge(edgeKey(id, data.to), (edge) => ({ count: edge.count + 1, active: true }));
      patchAgent(id, { answer: "", reasoning: "" });
      next.steps = [
        ...state.steps,
        { kind: "handoff", seq: event.seq, agent: id, depth: depth + 1, to: data.to, task: data.task },
      ];
      break;

    case "agent_retry":
      if (!id) break;
      patchAgent(id, { answer: "", reasoning: "" });
      next.steps = [
        ...state.steps,
        { kind: "retry", seq: event.seq, agent: id, depth: depth + 1, reason: data.reason },
      ];
      break;

    case "agent_end": {
      if (!id) break;
      const current = next.agents[id];
      next.stack = state.stack.filter((agentId) => agentId !== id);
      const parent = next.stack.at(-1);
      patchAgent(id, { status: "done" });
      if (parent) {
        patchAgent(parent, { status: "running" });
        patchEdge(edgeKey(parent, id), (edge) => ({ ...edge, active: false }));
      }
      next.steps = [
        ...state.steps,
        {
          kind: "agent_end",
          seq: event.seq,
          agent: id,
          depth,
          ms: current ? ts - current.startedAt : 0,
          tokens: current?.tokens ?? 0,
          tokensPerS: current?.tokensPerS ?? null,
        },
      ];
      break;
    }

    case "error":
      next.error = data.message;
      next.steps = [...state.steps, { kind: "error", seq: event.seq, agent: null, depth: 0, message: data.message }];
      break;

    case "run_end": {
      next.status = data.ok ? "done" : "failed";
      next.output = data.output;
      next.totalMs = data.total_ms;
      // Whatever was still lit when the run stopped (a failed run ends mid-step).
      next.stack = [];
      next.agents = Object.fromEntries(
        Object.entries(next.agents).map(([key, agent]) => [key, { ...agent, status: "done" as const }]),
      );
      next.tools = Object.fromEntries(Object.entries(next.tools).map(([key, tool]) => [key, { ...tool, pending: 0 }]));
      next.edges = Object.fromEntries(Object.entries(next.edges).map(([key, edge]) => [key, { ...edge, active: false }]));
      break;
    }
  }
  return next;
}

function reducer(state: RunState, action: Action): RunState {
  switch (action.type) {
    case "follow":
      return { ...idleRun, runId: action.runId, status: "running" };
    case "events":
      return action.events.reduce(apply, state);
    case "lost":
      if (action.runId !== state.runId || state.status !== "running") return state;
      return { ...state, status: "failed", error: action.message, stack: [] };
    case "clear":
      return idleRun;
  }
}

const RECONNECTS = 5;

/**
 * Follows a run's event stream. The backend replays every run from seq 0, so
 * the same call shows a run that is in progress or one that already finished.
 * `live` feeds the tokens/s counter; a replayed run must not.
 */
export function useAgentRun() {
  const [state, dispatch] = useReducer(reducer, idleRun);
  const abortRef = useRef<AbortController | null>(null);

  const follow = useCallback((runId: string, live: boolean) => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    dispatch({ type: "follow", runId });

    let queue: AgentEvent[] = [];
    let frame = 0;
    const flush = () => {
      frame = 0;
      const events = queue;
      queue = [];
      if (!abort.signal.aborted) dispatch({ type: "events", events });
    };

    (async () => {
      let lastSeq = -1;
      let message = "Se perdió la conexión con el backend durante la corrida.";
      for (let attempt = 0; attempt <= RECONNECTS; attempt++) {
        try {
          const res = await fetch(`/api/agents/runs/${runId}/events`, { signal: abort.signal });
          if (res.status === 404) {
            message = "Esta corrida ya no está en el backend (se reinició desde entonces).";
            break;
          }
          if (!res.ok) throw new Error(await errorText(res));
          for await (const event of sse<AgentEvent>(res)) {
            if (event.seq <= lastSeq) continue; // replayed after a reconnect
            lastSeq = event.seq;
            if (live) {
              if (event.type === "llm_delta") reportToken();
              if (event.type === "llm_end") {
                reportEnd(event.data.model, event.data.tokens_per_s, event.data.usage?.completion_tokens ?? null);
              }
            }
            queue.push(event);
            if (!frame) frame = requestAnimationFrame(flush);
            if (event.type === "run_end") return;
          }
        } catch {
          if (abort.signal.aborted) return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (abort.signal.aborted) return;
      }
      dispatch({ type: "lost", runId, message });
    })();
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "clear" });
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { state, follow, clear };
}
