import { useEffect, useRef, useState } from "react";
import { runChatStream, type ChatMessage, type StreamState } from "../lib/api";
import { reportEnd, reportToken } from "../lib/metrics";
import { Markdown, Reasoning } from "../components/Markdown";
import { Button, Chip, ErrorBox, Icon, StreamStats, Waiting } from "../components/ui";

type Turn = { id: number; role: "user"; content: string } | { id: number; role: "assistant"; stream: StreamState };

const EXAMPLES = [
  "Explica qué es un modelo de lenguaje con una analogía de una planta de manufactura.",
  "Escribe un correo breve para avisar de un paro programado de la línea 2 mañana a las 6:00.",
  "Dame un plan de cinco pasos para reducir el scrap en una línea de inyección de plástico.",
];

export function ChatTab({ model }: { model: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const nextId = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true); // follow new text unless the user scrolled up

  useEffect(() => {
    const box = scrollRef.current;
    if (box && pinned.current) box.scrollTop = box.scrollHeight;
  }, [turns]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy || !model) return;

    // Only finished exchanges go back to the model as history.
    const history: ChatMessage[] = [];
    for (const turn of turns) {
      if (turn.role === "user") history.push({ role: "user", content: turn.content });
      else if (turn.stream.answer) history.push({ role: "assistant", content: turn.stream.answer });
    }
    history.push({ role: "user", content });

    const answerId = nextId.current + 1;
    nextId.current += 2;
    setTurns((previous) => [
      ...previous,
      { id: answerId - 1, role: "user", content },
      { id: answerId, role: "assistant", stream: { status: "waiting", answer: "", reasoning: "" } },
    ]);
    setInput("");
    setBusy(true);
    pinned.current = true;

    const abort = new AbortController();
    abortRef.current = abort;
    const final = await runChatStream(
      () =>
        fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history, model }),
          signal: abort.signal,
        }),
      (stream) =>
        setTurns((previous) => previous.map((turn) => (turn.id === answerId ? { ...turn, role: "assistant", stream } : turn))),
      reportToken,
      abort.signal,
    );
    if (final.end) reportEnd(final.end.model, final.end.tokens_per_s, final.end.usage.completion_tokens);
    setBusy(false);
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-3">
      <div
        ref={scrollRef}
        onScroll={(event) => {
          const box = event.currentTarget;
          pinned.current = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
        }}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto rounded-xl border border-line bg-white p-5"
      >
        {turns.length === 0 && (
          <div className="m-auto flex max-w-2xl flex-col items-center gap-4 text-center">
            <h2 className="text-2xl font-bold text-brand">Chat con el modelo local</h2>
            <p className="text-muted">
              Todo corre en esta máquina: la pregunta no sale a internet. Mira el panel de GPU mientras responde.
            </p>
            <div className="flex flex-col items-stretch gap-2">
              {EXAMPLES.map((example) => (
                <Chip key={example} onClick={() => send(example)} disabled={!model}>
                  {example}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn) =>
          turn.role === "user" ? (
            <div key={turn.id} className="max-w-[80%] self-end rounded-2xl rounded-br-sm bg-brand px-4 py-2.5 whitespace-pre-wrap text-white">
              {turn.content}
            </div>
          ) : (
            <Answer key={turn.id} stream={turn.stream} />
          ),
        )}
      </div>

      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          send(input);
        }}
      >
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              send(input);
            }
          }}
          rows={2}
          placeholder="Escribe tu pregunta. Enter para enviar, Shift+Enter para otra línea."
          aria-label="Mensaje"
          className="min-h-[3.4rem] flex-1 resize-none rounded-xl border border-line bg-white px-4 py-3 placeholder:text-muted/70 focus:border-brand focus:outline-none"
        />
        <div className="flex flex-col gap-2">
          {busy ? (
            <Button variant="danger" onClick={() => abortRef.current?.abort()}>
              <Icon name="stop" className="size-5" /> Detener
            </Button>
          ) : (
            <Button type="submit" disabled={!input.trim() || !model}>
              <Icon name="send" className="size-5" /> Enviar
            </Button>
          )}
          <Button variant="secondary" className="py-1 text-sm" disabled={busy || turns.length === 0} onClick={() => setTurns([])}>
            Nueva conversación
          </Button>
        </div>
      </form>
    </div>
  );
}

function Answer({ stream }: { stream: StreamState }) {
  const streaming = stream.status === "streaming";
  return (
    <div className="flex max-w-[92%] flex-col gap-2 self-start">
      {stream.status === "waiting" && <Waiting />}
      <Reasoning text={stream.reasoning} open={streaming && !stream.answer} />
      {stream.answer && (
        <div className="rounded-2xl rounded-bl-sm border border-line bg-surface px-4 py-3">
          <Markdown text={stream.answer} streaming={streaming} />
        </div>
      )}
      {stream.status === "stopped" && <p className="text-sm text-muted">Respuesta detenida.</p>}
      {stream.error && <ErrorBox>{stream.error}</ErrorBox>}
      {stream.end && <StreamStats end={stream.end} />}
    </div>
  );
}
