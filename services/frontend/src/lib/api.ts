// Types and helpers for the backend API. The contract is docs/data-contracts.md.

export type Config = { client_name: string; llm_model: string; vlm_model: string };

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type Usage = { prompt_tokens: number | null; completion_tokens: number | null };

export type ChatEnd = {
  type: "end";
  model: string;
  usage: Usage;
  ttft_ms: number | null;
  total_ms: number;
  tokens_per_s: number | null;
};

export type ChatEvent =
  | { type: "reasoning"; text: string }
  | { type: "delta"; text: string }
  | ChatEnd
  | { type: "error"; message: string };

export type GpuInfo = {
  index: number;
  name: string | null;
  util_pct: number | null;
  mem_used_mb: number | null;
  mem_total_mb: number | null;
  temp_c: number | null;
  power_w: number | null;
};

export type GpuSample = {
  ts: string;
  gpus: GpuInfo[];
  host: { mem_used_mb: number; mem_total_mb: number };
};

export type ScenarioNode = { id: string; kind: "agent" | "tool"; label: string; x: number; y: number };

export type Scenario = {
  id: string;
  title: string;
  description: string;
  needs_image: boolean;
  examples: string[];
  nodes: ScenarioNode[];
  edges: [string, string][];
};

export type AgentEvent = {
  run_id: string;
  seq: number;
  ts: string;
  type:
    | "run_start"
    | "agent_start"
    | "llm_delta"
    | "llm_end"
    | "tool_call"
    | "tool_result"
    | "handoff"
    | "agent_retry"
    | "agent_end"
    | "error"
    | "run_end";
  agent: string | null;
  // Shape depends on `type`; see the table in docs/data-contracts.md.
  data: Record<string, any>;
};

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal });
  if (!res.ok) throw new Error(await errorText(res));
  return res.json();
}

/** FastAPI errors come as {"detail": "..."}; anything else falls back to the status. */
export async function errorText(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") return body.detail;
  } catch {
    // not JSON
  }
  return `HTTP ${res.status}`;
}

/** Parses a Server-Sent Events body: one JSON object per `data:` line. */
export async function* sse<T>(res: Response): AsyncGenerator<T> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        for (const line of block.split("\n")) {
          if (line.startsWith("data:")) yield JSON.parse(line.slice(5)) as T;
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

export type StreamStatus = "waiting" | "streaming" | "done" | "error" | "stopped";

export type StreamState = {
  status: StreamStatus;
  answer: string;
  reasoning: string;
  end?: ChatEnd;
  error?: string;
};

/**
 * Runs one `chat` event stream (POST /api/chat or /api/vision) to its end.
 * `onState` is called at most once per animation frame while tokens arrive.
 */
export async function runChatStream(
  request: () => Promise<Response>,
  onState: (state: StreamState) => void,
  onToken: () => void,
  signal: AbortSignal,
): Promise<StreamState> {
  const state: StreamState = { status: "waiting", answer: "", reasoning: "" };
  let frame = 0;
  const flush = () => {
    frame = 0;
    onState({ ...state });
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(flush);
  };

  try {
    const res = await request();
    if (!res.ok) throw new Error(await errorText(res));
    for await (const event of sse<ChatEvent>(res)) {
      if (event.type === "delta") {
        state.answer += event.text;
        state.status = "streaming";
        onToken();
      } else if (event.type === "reasoning") {
        state.reasoning += event.text;
        state.status = "streaming";
        onToken();
      } else if (event.type === "end") {
        state.end = event;
        state.status = "done";
      } else if (event.type === "error") {
        state.error = event.message;
        state.status = "error";
      }
      schedule();
    }
    if (state.status === "waiting" || state.status === "streaming") {
      state.status = "error";
      state.error = "La respuesta se cortó antes de terminar.";
    }
  } catch (err) {
    if (signal.aborted) {
      state.status = "stopped";
    } else {
      state.status = "error";
      state.error = `No se pudo hablar con el backend: ${(err as Error).message}`;
    }
  }
  if (frame) cancelAnimationFrame(frame);
  onState({ ...state });
  return state;
}
