import { useEffect, useRef, useState } from "react";
import { runChatStream, type StreamState } from "../lib/api";
import { reportEnd, reportToken } from "../lib/metrics";
import { ImageDrop } from "../components/ImageDrop";
import { Markdown, Reasoning } from "../components/Markdown";
import { Button, Card, Chip, ErrorBox, Icon, StreamStats, Waiting } from "../components/ui";

const EXAMPLES = [
  "Describe lo que ves en esta imagen.",
  "Lista los riesgos de seguridad que observes, del más grave al menos grave.",
  'Devuelve solo un JSON con esta forma: {"lugar": "", "personas": 0, "equipo": [], "riesgos": []}',
];

export function VisionTab({ model, active }: { model: string; active: boolean }) {
  const [image, setImage] = useState<File | null>(null);
  const [prompt, setPrompt] = useState(EXAMPLES[0]);
  const [stream, setStream] = useState<StreamState | null>(null);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = async (text: string) => {
    const question = text.trim();
    if (!image || !question || busy) return;
    setBusy(true);
    setStream({ status: "waiting", answer: "", reasoning: "" });

    const abort = new AbortController();
    abortRef.current = abort;
    const final = await runChatStream(
      () => {
        const form = new FormData();
        form.append("image", image);
        form.append("prompt", question);
        return fetch("/api/vision", { method: "POST", body: form, signal: abort.signal });
      },
      setStream,
      reportToken,
      abort.signal,
    );
    if (final.end) reportEnd(final.end.model, final.end.tokens_per_s, final.end.usage.completion_tokens);
    setBusy(false);
  };

  const streaming = stream?.status === "streaming";

  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-2">
      <div className="flex min-h-0 flex-col gap-3">
        <ImageDrop file={image} onFile={setImage} active={active} disabled={busy} className="min-h-56 flex-1" />
        <p className="text-sm text-muted">
          Modelo de visión: <span className="font-mono text-ink">{model || "–"}</span>. La imagen se queda en esta máquina.
        </p>
      </div>

      <div className="flex min-h-0 flex-col gap-3">
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            run(prompt);
          }}
        >
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={2}
            aria-label="Pregunta sobre la imagen"
            placeholder="¿Qué quieres saber de la imagen?"
            className="resize-none rounded-xl border border-line bg-white px-4 py-3 placeholder:text-muted/70 focus:border-brand focus:outline-none"
          />
          <div className="flex flex-wrap items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <Chip key={example} onClick={() => setPrompt(example)} disabled={busy}>
                  {example}
                </Chip>
              ))}
            </div>
            {busy ? (
              <Button variant="danger" onClick={() => abortRef.current?.abort()}>
                <Icon name="stop" className="size-5" /> Detener
              </Button>
            ) : (
              <Button type="submit" disabled={!image || !prompt.trim()}>
                <Icon name="play" className="size-5" /> Analizar
              </Button>
            )}
          </div>
        </form>

        <Card className="flex min-h-40 flex-1 flex-col gap-3 overflow-y-auto p-5">
          {!stream && (
            <p className="m-auto max-w-md text-center text-muted">
              {image ? "Elige una pregunta y presiona Analizar." : "Primero carga una imagen: una foto de planta, un tablero, una etiqueta."}
            </p>
          )}
          {stream?.status === "waiting" && <Waiting what="Esperando al modelo de visión" />}
          {stream && <Reasoning text={stream.reasoning} open={streaming && !stream.answer} />}
          {stream?.answer && <Markdown text={stream.answer} streaming={streaming} />}
          {stream?.status === "stopped" && <p className="text-sm text-muted">Respuesta detenida.</p>}
          {stream?.error && <ErrorBox>{stream.error}</ErrorBox>}
          {stream?.end && (
            <div className="mt-auto border-t border-line pt-3">
              <StreamStats end={stream.end} />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
