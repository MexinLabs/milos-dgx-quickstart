import { useEffect, useRef, useState } from "react";
import { errorText, getJson, type Scenario } from "../lib/api";
import { useAgentRun, type RunState } from "../lib/agentRun";
import { AgentGraph } from "../components/AgentGraph";
import { AgentTimeline } from "../components/AgentTimeline";
import { ImageDrop } from "../components/ImageDrop";
import { Markdown, Reasoning } from "../components/Markdown";
import { Button, Card, Chip, cx, ErrorBox, fmt, fmtDuration, Icon } from "../components/ui";

/** A finished run. The backend keeps its events, so clicking it replays it. */
type PastRun = { runId: string; scenario: string; model: string; input: string; totalMs: number; ok: boolean };

const HISTORY_KEY = "milos.agent-runs";
const CURRENT_KEY = "milos.agent-run";
const MAX_HISTORY = 6;

function stored<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage blocked: the page still works, it just forgets on reload
  }
}

export function AgentsTab({ model, active }: { model: string; active: boolean }) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [history, setHistory] = useState<PastRun[]>(() => stored(HISTORY_KEY, []));
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [wide, setWide] = useState(false); // the answer takes the graph's place
  const { state: run, follow, clear } = useAgentRun();

  // Scenarios come from the backend; retry until it is up.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const load = () =>
      getJson<{ scenarios: Scenario[] }>("/api/agents/scenarios")
        .then(({ scenarios: list }) => {
          if (cancelled) return;
          setScenarios(list);
          setSelectedId((current) => current ?? list[0]?.id ?? null);
          setInput((current) => current || (list[0]?.examples[0] ?? ""));
        })
        .catch(() => {
          if (!cancelled) timer = setTimeout(load, 3000);
        });
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // After a page reload, show the run that was on screen.
  useEffect(() => {
    const runId = stored<string | null>(CURRENT_KEY, null);
    if (runId) follow(runId, false);
  }, [follow]);

  // A replayed run brings its own scenario and question.
  useEffect(() => {
    if (run.scenario) setSelectedId(run.scenario);
    if (run.input) setInput(run.input);
  }, [run.runId, run.scenario, run.input]);

  useEffect(() => {
    if (run.status === "idle" || !run.runId) return;
    store(CURRENT_KEY, run.runId);
    if (run.status === "running" || run.totalMs === null || !run.scenario) return;
    const entry: PastRun = {
      runId: run.runId,
      scenario: run.scenario,
      model: run.model ?? "",
      input: run.input,
      totalMs: run.totalMs,
      ok: run.status === "done",
    };
    setHistory((previous) => {
      const next = [...previous.filter((item) => item.runId !== entry.runId), entry].slice(-MAX_HISTORY);
      store(HISTORY_KEY, next);
      return next;
    });
  }, [run.status, run.runId, run.totalMs, run.scenario, run.model, run.input]);

  const scenario = scenarios.find((item) => item.id === selectedId) ?? null;
  const running = run.status === "running";
  const busy = running || submitting;
  const elapsed = useElapsed(running ? startedAt : null);

  const pick = (next: Scenario) => {
    if (busy || next.id === selectedId) return;
    setSelectedId(next.id);
    setInput(next.examples[0] ?? "");
    setSubmitError(null);
    abandon();
  };

  const start = async () => {
    if (!scenario || busy || !input.trim()) return;
    if (scenario.needs_image && !image) {
      setSubmitError("Este escenario necesita una foto: cárgala a la izquierda.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const form = new FormData();
      form.append("scenario", scenario.id);
      form.append("input", input.trim());
      if (model) form.append("model", model);
      if (scenario.needs_image && image) form.append("image", image);
      const res = await fetch("/api/agents/runs", { method: "POST", body: form });
      if (!res.ok) throw new Error(await errorText(res));
      const { run_id } = await res.json();
      setStartedAt(Date.now());
      setWide(false);
      follow(run_id, true);
    } catch (err) {
      setSubmitError(`No se pudo iniciar la corrida: ${(err as Error).message}`);
    }
    setSubmitting(false);
  };

  const abandon = () => {
    setWide(false);
    clear();
    store(CURRENT_KEY, null);
  };

  const replay = (past: PastRun) => {
    if (busy) return;
    setStartedAt(null);
    setInput(past.input);
    follow(past.runId, false);
  };

  // Both panels follow new content unless the user scrolled up to read.
  const timelineRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  useEffect(() => {
    const box = timelineRef.current;
    if (box && pinned.current) box.scrollTop = box.scrollHeight;
  }, [run.steps]);

  const answerRef = useRef<HTMLDivElement>(null);
  const answerPinned = useRef(true);
  useEffect(() => {
    const box = answerRef.current;
    if (!box) return;
    if (running) {
      if (answerPinned.current) box.scrollTop = box.scrollHeight;
    } else {
      // The final answer is read from its first line.
      box.scrollTop = 0;
      answerPinned.current = true;
    }
  }, [run.agents, running, run.runId]);

  if (!scenario) return <p className="p-6 text-muted">Cargando los escenarios de agentes…</p>;

  const labels = Object.fromEntries(scenario.nodes.map((node) => [node.id, node.label]));

  return (
    <div className="flex flex-col gap-3 tall:h-full tall:min-h-0">
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Escenario">
          {scenarios.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={item.id === scenario.id}
              disabled={busy}
              onClick={() => pick(item)}
              className={cx(
                "min-w-64 flex-1 rounded-lg border-2 px-3.5 py-1.5 text-left transition-colors disabled:cursor-not-allowed",
                item.id === scenario.id ? "border-brand bg-brand-soft" : "border-line bg-white hover:border-brand disabled:opacity-60",
              )}
            >
              <span className="block font-bold text-brand">{item.title}</span>
              <span className="block text-sm text-muted">{item.description}</span>
            </button>
          ))}
        </div>

        <form
          className="flex flex-wrap items-stretch gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            start();
          }}
        >
          {scenario.needs_image && (
            <ImageDrop file={image} onFile={setImage} active={active} disabled={busy} compact className="h-32 w-52" />
          )}
          <div className="flex min-w-64 flex-1 flex-col gap-2">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  start();
                }
              }}
              rows={1}
              aria-label="Pregunta para los agentes"
              placeholder="¿Qué quieres preguntarle a los agentes?"
              className="flex-1 resize-none rounded-xl border border-line bg-white px-4 py-2.5 placeholder:text-muted/70 focus:border-brand focus:outline-none"
            />
            <div className="flex gap-2 max-md:flex-wrap">
              {scenario.examples.map((example) => (
                <Chip key={example} onClick={() => setInput(example)} disabled={busy} title={example} className="min-w-0 truncate">
                  {example}
                </Chip>
              ))}
            </div>
          </div>
          <div className="flex w-44 flex-col justify-between gap-2">
            <Button type="submit" disabled={busy || !input.trim() || !model} className="py-3 text-lg">
              <Icon name="play" className="size-5" />
              {running ? "Ejecutando" : "Ejecutar"}
            </Button>
            {running ? (
              <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm leading-snug">
                <span className="font-semibold text-ink">{elapsed !== null ? `${elapsed} s en curso` : "en curso"}</span>
                {/* The way out if the backend went away mid-run and no more events will come. */}
                <button type="button" onClick={abandon} className="text-muted underline hover:text-danger">
                  dejar de seguir
                </button>
              </p>
            ) : (
              <p className="text-sm leading-snug text-muted">
                Con <span className="font-mono text-ink">{model || "–"}</span>
              </p>
            )}
          </div>
        </form>

        {submitError && <ErrorBox>{submitError}</ErrorBox>}
      </Card>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] tall:min-h-0 tall:flex-1">
        <div className="flex flex-col gap-3 tall:min-h-0">
          <Card className={cx("shrink-0 p-2", wide && "hidden")}>
            <AgentGraph scenario={scenario} run={run} />
          </Card>
          <Card className="relative flex min-h-56 flex-col tall:min-h-0 tall:flex-1">
            {run.status !== "idle" && (
              <button
                type="button"
                onClick={() => setWide((value) => !value)}
                className="absolute top-3 right-4 z-10 rounded-md border border-line bg-white px-2.5 py-0.5 text-sm font-semibold text-muted hover:border-brand hover:text-brand"
              >
                {wide ? "Ver el grafo" : "Ampliar"}
              </button>
            )}
            <div
              ref={answerRef}
              onScroll={(event) => {
                const box = event.currentTarget;
                answerPinned.current = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
              }}
              className="flex flex-1 flex-col gap-3 p-5 tall:overflow-y-auto"
            >
              <Answer run={run} />
            </div>
          </Card>
        </div>

        <Card className="flex flex-col tall:min-h-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line px-4 py-2">
            <h2 className="mr-auto font-bold text-brand">Paso a paso</h2>
            {history.map((past) => (
              <button
                key={past.runId}
                type="button"
                disabled={busy}
                onClick={() => replay(past)}
                title={`Volver a ver: ${scenarios.find((item) => item.id === past.scenario)?.title ?? past.scenario}. ${past.input}`}
                className={cx(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                  past.runId === run.runId ? "border-brand bg-brand-soft" : "border-line bg-white hover:border-brand",
                )}
              >
                <Icon name={past.ok ? "check" : "alert"} className={cx("size-4", past.ok ? "text-highlight" : "text-danger")} />
                <span className="font-mono">{past.model}</span>
                <span className="text-muted">{fmtDuration(past.totalMs)}</span>
              </button>
            ))}
          </div>
          <div
            ref={timelineRef}
            onScroll={(event) => {
              const box = event.currentTarget;
              pinned.current = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
            }}
            className="flex min-h-56 flex-1 flex-col p-2.5 tall:min-h-0 tall:overflow-y-auto"
          >
            <AgentTimeline run={run} labels={labels} />
          </div>
        </Card>
      </div>
    </div>
  );
}

/** The text being generated while the run is live, then the final answer. */
function Answer({ run }: { run: RunState }) {
  if (run.status === "idle") {
    return (
      <p className="m-auto max-w-md text-center text-muted">
        Presiona Ejecutar: aquí verás escribir a cada agente y, al final, la respuesta.
      </p>
    );
  }

  if (run.status === "running") {
    const activeId = run.stack.at(-1);
    const activeAgent = activeId ? run.agents[activeId] : undefined;
    const writer = run.writer ? run.agents[run.writer] : undefined;
    const shown = writer && (writer.answer || writer.reasoning) ? writer : undefined;
    const writing = !!shown && shown.id === activeId;
    return (
      <>
        <h2 className="flex flex-wrap items-baseline gap-x-2 font-bold text-brand">
          {activeAgent ? (
            <span className={writing ? undefined : "dots"}>
              {activeAgent.label} {writing ? "está escribiendo" : "está trabajando"}
            </span>
          ) : (
            <span className="dots">Iniciando la corrida</span>
          )}
          {activeAgent && <span className="font-mono text-sm font-normal text-muted">{activeAgent.model}</span>}
        </h2>
        {shown && !writing && <p className="text-sm text-muted">Lo último que escribió {shown.label}:</p>}
        {shown && <Reasoning text={shown.reasoning} open={writing && !shown.answer} />}
        {shown?.answer && <Markdown text={shown.answer} streaming={writing} />}
      </>
    );
  }

  return (
    <>
      <h2 className="font-bold text-brand">{run.status === "done" ? "Respuesta final" : "La corrida no terminó"}</h2>
      {run.error && <ErrorBox>{run.error}</ErrorBox>}
      {run.output ? (
        <Markdown text={run.output} />
      ) : (
        run.status === "done" && <p className="text-muted">Los agentes terminaron sin escribir una respuesta.</p>
      )}
      {run.totalMs !== null && (
        <p className="mt-auto flex flex-wrap gap-x-5 border-t border-line pt-3 text-sm text-muted">
          <span className="font-mono text-ink">{run.model}</span>
          <span>
            <strong className="text-ink">{fmtDuration(run.totalMs)}</strong> en total
          </span>
          <span>
            <strong className="text-ink">{fmt(run.tokens)}</strong> tokens generados
          </span>
        </p>
      )}
    </>
  );
}

/** Whole seconds since `since`, ticking while it is set. */
function useElapsed(since: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);
  return since === null ? null : Math.max(0, Math.round((now - since) / 1000));
}
