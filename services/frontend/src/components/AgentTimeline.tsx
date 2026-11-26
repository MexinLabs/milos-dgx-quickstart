// The run as an ordered list of steps. Tool arguments and results open on click.

import type { ReactNode } from "react";
import type { RunState, Step } from "../lib/agentRun";
import { cx, fmt, fmtDuration, Icon, type IconName } from "./ui";

type Props = {
  run: RunState;
  /** Node id to the label the scenario gives it (agents and tools). */
  labels: Record<string, string>;
};

export function AgentTimeline({ run, labels }: Props) {
  const name = (id: string) => run.agents[id]?.label ?? labels[id] ?? id;

  if (run.steps.length === 0) {
    return (
      <p className="m-auto max-w-xs text-center text-muted">
        Aquí aparece cada paso de la corrida: qué agente trabaja, qué herramienta llama y qué le responde.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-1.5">
      {run.steps.map((step) => (
        <li key={step.seq} style={{ marginLeft: step.depth * 18 }}>
          <StepRow step={step} name={name} toolLabel={(tool) => labels[tool]} />
        </li>
      ))}
    </ol>
  );
}

function StepRow({ step, name, toolLabel }: { step: Step; name: (id: string) => string; toolLabel: (tool: string) => string | undefined }) {
  switch (step.kind) {
    case "agent_start":
      return (
        <Row icon="agent" tone="agent" title={<strong>{step.label}</strong>} note={<span className="font-mono">{step.model}</span>}>
          {step.depth === 0 && <Block label="Pregunta">{step.task}</Block>}
        </Row>
      );

    case "handoff":
      return (
        <Row
          icon="arrow"
          tone="agent"
          title={
            <>
              Delega a <strong>{name(step.to)}</strong>
            </>
          }
        >
          <Block label="Tarea">{step.task}</Block>
        </Row>
      );

    case "tool": {
      const label = toolLabel(step.tool);
      return (
        <Row
          icon="tool"
          tone={step.done && !step.ok ? "error" : "tool"}
          title={
            <>
              <strong>{label ?? step.tool}</strong>
              {label && <span className="ml-1.5 font-mono text-sm text-muted">{step.tool}</span>}
            </>
          }
          note={!step.done ? <span className="dots">en curso</span> : step.ok ? fmtDuration(step.ms) : `error · ${fmtDuration(step.ms)}`}
          preview={preview(step.args)}
        >
          <Block label="Argumentos" mono>
            {pretty(step.args)}
          </Block>
          {step.done && <Result value={step.result} />}
        </Row>
      );
    }

    case "retry":
      return (
        <Row icon="retry" tone="warn" title="Respuesta descartada: vuelve a sus herramientas">
          <Block label="Lo que se le pidió">{step.reason}</Block>
        </Row>
      );

    case "agent_end":
      return (
        <Row
          icon="check"
          tone="done"
          title={
            <>
              <strong>{name(step.agent)}</strong> terminó
            </>
          }
          note={`${fmtDuration(step.ms)} · ${fmt(step.tokens)} tokens${step.tokensPerS ? ` · ${fmt(step.tokensPerS)} tokens/s` : ""}`}
        />
      );

    case "error":
      return (
        <Row icon="alert" tone="error" title="La corrida falló">
          <Block label="Error" mono>
            {step.message}
          </Block>
        </Row>
      );
  }
}

const TONES = {
  agent: "bg-brand text-white",
  tool: "bg-accent-soft text-[#c2570c]",
  done: "bg-brand-soft text-brand",
  warn: "bg-amber-100 text-warning",
  error: "bg-danger-soft text-danger",
};

type RowProps = {
  icon: IconName;
  tone: keyof typeof TONES;
  title: ReactNode;
  note?: ReactNode;
  preview?: string;
  children?: ReactNode;
};

function Row({ icon, tone, title, note, preview, children }: RowProps) {
  const hasDetails = Array.isArray(children) ? children.some(Boolean) : !!children;
  const head = (
    <span className="flex min-w-0 items-center gap-2.5">
      <span className={cx("flex size-7 shrink-0 items-center justify-center rounded-full", TONES[tone])}>
        <Icon name={icon} className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{title}</span>
        {preview && <span className="block truncate font-mono text-sm text-muted">{preview}</span>}
      </span>
      {note && <span className="shrink-0 text-sm text-muted">{note}</span>}
    </span>
  );
  if (!hasDetails) return <div className="rounded-lg px-2 py-1.5">{head}</div>;
  return (
    <details className="group rounded-lg border border-transparent open:border-line open:bg-surface">
      <summary className="list-none rounded-lg px-2 py-1.5 hover:bg-surface [&::-webkit-details-marker]:hidden">{head}</summary>
      <div className="flex flex-col gap-2 px-2 pt-1 pb-2.5 pl-[2.9rem]">{children}</div>
    </details>
  );
}

function Block({ label, mono, children }: { label: string; mono?: boolean; children: ReactNode }) {
  return (
    <div>
      <div className="text-sm font-semibold text-muted">{label}</div>
      <div
        className={cx(
          "max-h-64 overflow-auto rounded-md border border-line bg-white px-2.5 py-1.5 whitespace-pre-wrap",
          mono ? "font-mono text-sm" : "text-[0.95rem]",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Rows and columns become a table; anything else is shown as JSON. */
function Result({ value }: { value: unknown }) {
  const table = asTable(value);
  if (!table) {
    return (
      <Block label="Resultado" mono>
        {pretty(value)}
      </Block>
    );
  }
  return (
    <div>
      <div className="text-sm font-semibold text-muted">
        Resultado: {table.rows.length} {table.rows.length === 1 ? "fila" : "filas"}
        {table.truncated && " (truncado)"}
      </div>
      <div className="max-h-64 overflow-auto rounded-md border border-line bg-white">
        <table className="w-full border-collapse text-sm tabular-nums">
          <thead className="sticky top-0 bg-surface">
            <tr>
              {table.columns.map((column, index) => (
                <th key={index} className="border-b border-line px-2.5 py-1 text-left font-semibold">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-line last:border-0">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-2.5 py-1">
                    {typeof cell === "number" ? cellNumber.format(cell) : String(cell ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Query results keep their decimals: a scrap rate of 0.0749 must not read as 0.1.
const cellNumber = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 4 });

function asTable(value: unknown): { columns: string[]; rows: unknown[][]; truncated: boolean } | null {
  if (!value || typeof value !== "object") return null;
  const { columnas, filas, truncado } = value as Record<string, unknown>;
  if (!Array.isArray(columnas) || !Array.isArray(filas) || !filas.every(Array.isArray)) return null;
  return { columns: columnas.map(String), rows: filas as unknown[][], truncated: truncado === true };
}

function pretty(value: unknown): string {
  if (value === null || value === undefined) return "(sin argumentos válidos)";
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

/** One line for the collapsed row: the SQL of a query, or the arguments as JSON. */
function preview(args: unknown): string | undefined {
  if (!args || typeof args !== "object") return undefined;
  const values = Object.values(args);
  if (values.length === 0) return undefined;
  const text = values.length === 1 && typeof values[0] === "string" ? values[0] : JSON.stringify(args);
  return text.replace(/\s+/g, " ");
}
