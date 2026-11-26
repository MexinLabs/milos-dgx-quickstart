// Agents and tools as a graph. The layout (x, y per node) comes from the
// scenario definition; this file only draws it and lights it from the run state.

import type { Scenario, ScenarioNode } from "../lib/api";
import type { RunState } from "../lib/agentRun";
import { fmtDuration } from "./ui";

const COL = 278; // distance between columns
const ROW = 76; // distance between rows
const PAD = 22;
const SIZE = { agent: { w: 232, h: 66 }, tool: { w: 206, h: 58 } };

const GREEN = "var(--color-highlight)";
const BRAND = "var(--color-brand)";
const ORANGE = "var(--color-accent)";
const LINE = "#9aa3af";
const RED = "var(--color-danger)";

type Box = { node: ScenarioNode; x: number; y: number; w: number; h: number };

/** A node the run has not touched yet has no entry. */
function lookup<T>(map: Record<string, T>, key: string): T | undefined {
  return map[key];
}

function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

export function AgentGraph({ scenario, run }: { scenario: Scenario; run: RunState }) {
  const tallest = SIZE.agent.h;
  const boxes = new Map<string, Box>();
  for (const node of scenario.nodes) {
    const { w, h } = SIZE[node.kind];
    boxes.set(node.id, { node, w, h, x: PAD + node.x * COL, y: PAD + node.y * ROW + (tallest - h) / 2 });
  }
  const maxX = Math.max(...scenario.nodes.map((node) => node.x));
  const maxY = Math.max(...scenario.nodes.map((node) => node.y));
  const width = PAD * 2 + maxX * COL + SIZE.agent.w;
  const height = PAD * 2 + maxY * ROW + tallest;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Grafo del escenario ${scenario.title}: agentes y herramientas`}
      className="mx-auto block w-full"
      style={{ maxWidth: width * 1.1, maxHeight: height * 1.1 }}
    >
      <defs>
        {[
          ["arrow-idle", LINE],
          ["arrow-on", GREEN],
        ].map(([id, color]) => (
          <marker key={id} id={id} viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto">
            <path d="M0 1.5 L9 5 L0 8.5 z" fill={color} />
          </marker>
        ))}
      </defs>

      {scenario.edges.map(([from, to]) => {
        const a = boxes.get(from);
        const b = boxes.get(to);
        if (!a || !b) return null;
        const x1 = a.x + a.w;
        const y1 = a.y + a.h / 2;
        const x2 = b.x - 4;
        const y2 = b.y + b.h / 2;
        const bend = (x2 - x1) / 2;
        const d = `M${x1} ${y1} C${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
        const edge = run.edges[`${from}>${to}`];
        const used = !!edge && edge.count > 0;
        return (
          <g key={`${from}>${to}`}>
            <path
              d={d}
              fill="none"
              stroke={used ? GREEN : LINE}
              strokeWidth={edge?.active ? 3 : 2}
              markerEnd={`url(#${used ? "arrow-on" : "arrow-idle"})`}
              className={edge?.active ? "edge-flow" : undefined}
            />
            {/* Remounted on every call along this edge, so the animation plays again. */}
            {used && (
              <path
                key={edge.count}
                d={d}
                pathLength={100}
                fill="none"
                stroke={ORANGE}
                strokeWidth={7}
                strokeLinecap="round"
                className="edge-shot"
              />
            )}
          </g>
        );
      })}

      {scenario.nodes.map((node) => {
        const box = boxes.get(node.id)!;
        return node.kind === "agent" ? (
          <AgentNode key={node.id} box={box} run={run} />
        ) : (
          <ToolNode key={node.id} box={box} run={run} />
        );
      })}
    </svg>
  );
}

function AgentNode({ box, run }: { box: Box; run: RunState }) {
  const { node, x, y, w, h } = box;
  const agent = lookup(run.agents, node.id);
  const status = agent?.status ?? "idle";
  const stroke = status === "idle" ? LINE : status === "done" ? BRAND : GREEN;
  const detail =
    status === "idle"
      ? "agente"
      : status === "waiting"
        ? "esperando respuesta"
        : clip(agent!.model, 21);

  return (
    <g>
      <title>{`${node.label}: ${status === "idle" ? "sin usar" : status === "running" ? "trabajando" : status === "waiting" ? "esperando" : "terminó"}`}</title>
      {status === "running" && (
        <rect x={x} y={y} width={w} height={h} rx={14} fill="none" stroke={GREEN} className="node-pulse" />
      )}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={14}
        fill={status === "running" ? "var(--color-brand-soft)" : "white"}
        stroke={stroke}
        strokeWidth={status === "idle" ? 1.5 : 2.5}
      />
      <circle cx={x + 32} cy={y + h / 2} r={18} fill={status === "idle" ? "#eef0f3" : BRAND} />
      <g
        transform={`translate(${x + 21} ${y + h / 2 - 11}) scale(0.92)`}
        fill="none"
        stroke={status === "idle" ? "var(--color-muted)" : "white"}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9 3h6M12 3v3M6 6h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM9 12v1.5M15 12v1.5M9 16.5h6" />
      </g>
      <text x={x + 60} y={y + h / 2 - 5} fontSize={17} fontWeight={700} fill="var(--color-ink)">
        {clip(node.label, 18)}
      </text>
      <text
        x={x + 60}
        y={y + h / 2 + 16}
        fontSize={13.5}
        fill="var(--color-muted)"
        fontFamily={status === "running" || status === "done" ? "var(--font-mono)" : undefined}
      >
        {detail}
      </text>
      {status === "done" && <Check cx={x + w - 4} cy={y + 4} />}
    </g>
  );
}

function ToolNode({ box, run }: { box: Box; run: RunState }) {
  const { node, x, y, w, h } = box;
  const tool = lookup(run.tools, node.id);
  const calls = tool?.calls ?? 0;
  const pending = (tool?.pending ?? 0) > 0;
  const failed = tool?.failed ?? false;
  const stroke = calls === 0 ? LINE : failed ? RED : ORANGE;
  const detail =
    calls === 0
      ? "herramienta"
      : `${calls} ${calls === 1 ? "llamada" : "llamadas"}${failed ? " · con error" : tool?.lastMs != null ? ` · ${fmtDuration(tool.lastMs)}` : ""}`;

  return (
    <g>
      <title>{`${node.label} (${node.id}): ${detail}`}</title>
      {pending ? (
        <rect x={x} y={y} width={w} height={h} rx={h / 2} fill="none" stroke={ORANGE} className="node-pulse" />
      ) : (
        calls > 0 && (
          <rect key={calls} x={x} y={y} width={w} height={h} rx={h / 2} fill="none" stroke={ORANGE} strokeOpacity={0} className="node-flash" />
        )
      )}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={h / 2}
        fill={pending ? "var(--color-accent-soft)" : "white"}
        stroke={stroke}
        strokeWidth={calls === 0 ? 1.5 : 2.5}
      />
      <g
        transform={`translate(${x + 16} ${y + h / 2 - 11}) scale(0.92)`}
        fill="none"
        stroke={calls === 0 ? "var(--color-muted)" : failed ? RED : "#c2570c"}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14.5 6.5a4 4 0 0 0-5.3 5.2L4 17v3h3l5.3-5.2a4 4 0 0 0 5.2-5.3L15 12l-3-3z" />
      </g>
      <text x={x + 46} y={y + h / 2 - 4} fontSize={16} fontWeight={700} fill="var(--color-ink)">
        {clip(node.label, 17)}
      </text>
      <text x={x + 46} y={y + h / 2 + 15} fontSize={13.5} fill="var(--color-muted)">
        {detail}
      </text>
    </g>
  );
}

function Check({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={11} fill={BRAND} stroke="white" strokeWidth={2} />
      <path d={`M${cx - 5} ${cy + 0.5} l3.5 3.5 l6.5 -7`} fill="none" stroke="white" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}
