// GPU load, memory and tokens per second. Visible on every tab.

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import type { GpuInfo, GpuSample } from "../lib/api";
import { useTokenRate } from "../lib/metrics";
import { cx, fmt, Icon } from "./ui";

const HISTORY = 60; // one sample per second
const STALE_MS = 4000;

export function GpuPanel() {
  const [sample, setSample] = useState<GpuSample | null>(null);
  const [history, setHistory] = useState<Record<number, (number | null)[]>>({});
  const [stale, setStale] = useState(false);
  const lastAt = useRef(0);

  useEffect(() => {
    let source: EventSource;
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      source = new EventSource("/api/gpu/stream");
      source.onmessage = (message) => {
        const next: GpuSample = JSON.parse(message.data);
        lastAt.current = Date.now();
        setStale(false);
        setSample(next);
        setHistory((previous) => {
          const updated: Record<number, (number | null)[]> = {};
          for (const gpu of next.gpus) {
            updated[gpu.index] = [...(previous[gpu.index] ?? []), gpu.util_pct].slice(-HISTORY);
          }
          return updated;
        });
      };
      // An EventSource that gets an error response does not retry by itself.
      source.onerror = reconnect;
    };
    const reconnect = () => {
      source.close();
      clearTimeout(retry);
      retry = setTimeout(connect, 2000);
    };
    connect();
    // When the backend restarts, the dev proxy can leave this connection open
    // with nothing coming through, so silence is treated as a lost connection.
    const watchdog = setInterval(() => {
      const silent = Date.now() - lastAt.current > STALE_MS;
      setStale(silent);
      if (silent && source.readyState !== EventSource.CLOSED) reconnect();
    }, 1000);
    return () => {
      source.close();
      clearTimeout(retry);
      clearInterval(watchdog);
    };
  }, []);

  const gpus = sample?.gpus ?? [];
  // Unified-memory machines may not report memory per GPU: host memory is the GPU's memory.
  const unified = gpus.length > 0 && gpus.every((gpu) => gpu.mem_total_mb === null);

  return (
    <aside
      aria-label="Estado de la GPU"
      className="flex shrink-0 flex-col gap-3 border-line bg-white p-4 max-xl:border-b xl:w-[21rem] xl:overflow-y-auto xl:border-l"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold tracking-wide text-muted uppercase">GPU en vivo</h2>
        <span className={cx("flex items-center gap-1.5 text-sm", stale ? "text-danger" : "text-muted")}>
          <span className={cx("size-2 rounded-full", stale ? "bg-danger" : "bg-highlight")} />
          {stale ? "sin datos del backend" : "cada segundo"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:max-xl:grid-cols-2 lg:max-xl:grid-cols-4">
        {sample && gpus.length === 0 && (
          <Tile label="GPU">
            <p className="text-muted">El backend no ve ninguna GPU (NVML no disponible).</p>
          </Tile>
        )}

        {gpus.map((gpu) => (
          <Tile key={`util-${gpu.index}`} label={gpus.length > 1 ? `Uso de GPU ${gpu.index}` : "Uso de GPU"}>
            <div className="flex items-end justify-between gap-3">
              <Figure value={fmt(gpu.util_pct)} unit="%" />
              <Sparkline values={history[gpu.index] ?? []} />
            </div>
            <p className="truncate text-sm text-muted" title={gpu.name ?? undefined}>
              {gpu.name ?? "GPU"}
            </p>
          </Tile>
        ))}

        {sample && (
          <Tile label={unified ? "Memoria unificada (CPU + GPU)" : "Memoria"}>
            <div className="flex flex-col gap-3">
              {gpus
                .filter((gpu) => gpu.mem_total_mb !== null)
                .map((gpu) => (
                  <Meter
                    key={gpu.index}
                    label={gpus.length > 1 ? `GPU ${gpu.index}` : "GPU"}
                    usedMb={gpu.mem_used_mb ?? 0}
                    totalMb={gpu.mem_total_mb ?? 0}
                  />
                ))}
              <Meter label={unified ? "En uso" : "Sistema"} usedMb={sample.host.mem_used_mb} totalMb={sample.host.mem_total_mb} />
            </div>
          </Tile>
        )}

        {gpus.length > 0 && (
          <Tile label="Temperatura y potencia">
            <div className="flex flex-col gap-1">
              {gpus.map((gpu: GpuInfo) => (
                <div key={gpu.index} className="flex items-baseline gap-5">
                  <Figure value={fmt(gpu.temp_c)} unit="°C" small />
                  <Figure value={fmt(gpu.power_w)} unit="W" small />
                </div>
              ))}
            </div>
          </Tile>
        )}

        <TokenRateTile />
      </div>
    </aside>
  );
}

function TokenRateTile() {
  const rate = useTokenRate();
  return (
    <Tile label="Tokens por segundo">
      <Figure value={rate.tokensPerS === null ? "–" : (rate.live ? "≈ " : "") + fmt(rate.tokensPerS)} unit="tokens/s" />
      <p className="truncate text-sm text-muted">
        {rate.live ? (
          <span className="font-semibold text-highlight">generando ahora</span>
        ) : rate.model ? (
          <>
            última respuesta · <span className="font-mono">{rate.model}</span>
          </>
        ) : (
          "se mide en cada respuesta"
        )}
      </p>
    </Tile>
  );
}

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-line p-3">
      <h3 className="text-sm font-semibold text-muted">{label}</h3>
      {children}
    </div>
  );
}

function Figure({ value, unit, small }: { value: string; unit: string; small?: boolean }) {
  return (
    <p className="flex items-baseline gap-1.5 leading-none">
      <span className={cx("font-semibold text-ink", small ? "text-2xl" : "text-[2.6rem]")}>{value}</span>
      <span className="text-muted">{unit}</span>
    </p>
  );
}

/** Used / total with a bar. The label says the state too, so it never depends on color. */
function Meter({ label, usedMb, totalMb }: { label: string; usedMb: number; totalMb: number }) {
  const ratio = totalMb > 0 ? Math.min(1, usedMb / totalMb) : 0;
  const level = ratio >= 0.92 ? "critical" : ratio >= 0.8 ? "high" : "ok";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-muted">{label}</span>
        <span className="text-ink">
          <span className="text-lg font-semibold">{fmt(usedMb / 1024)}</span>
          <span className="text-muted"> / {fmt(totalMb / 1024, "GB")}</span>
        </span>
      </div>
      <div
        role="meter"
        aria-label={`Memoria ${label}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
        className={cx(
          "mt-1 h-2 overflow-hidden rounded-full",
          level === "ok" && "bg-brand-soft",
          level === "high" && "bg-amber-100",
          level === "critical" && "bg-danger-soft",
        )}
      >
        <div
          className={cx(
            "h-full rounded-full transition-[width] duration-500",
            level === "ok" && "bg-highlight",
            level === "high" && "bg-warning",
            level === "critical" && "bg-danger",
          )}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      {level !== "ok" && (
        <p className={cx("mt-1 flex items-center gap-1 text-sm font-semibold", level === "high" ? "text-warning" : "text-danger")}>
          <Icon name="alert" className="size-4" />
          {level === "high" ? "Memoria alta" : "Memoria casi llena"}
        </p>
      )}
    </div>
  );
}

const W = 150;
const H = 48;
const PAD = 5;

/** GPU utilization over the last minute, on a fixed 0 to 100 scale. */
function Sparkline({ values }: { values: (number | null)[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const x = (index: number) => PAD + ((HISTORY - values.length + index) / (HISTORY - 1)) * (W - 2 * PAD);
  const y = (value: number) => H - PAD - (value / 100) * (H - 2 * PAD);
  const points = values.flatMap((value, index) => (value === null ? [] : [{ index, value }]));
  if (points.length === 0) return null;

  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.index).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  const area = `${line} L${x(last.index).toFixed(1)} ${H - PAD} L${x(first.index).toFixed(1)} ${H - PAD} Z`;

  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * W;
    let nearest = points[0];
    for (const p of points) if (Math.abs(x(p.index) - px) < Math.abs(x(nearest.index) - px)) nearest = p;
    setHover(nearest.index);
  };
  const hovered = hover === null ? null : (points.find((p) => p.index === hover) ?? null);
  const secondsAgo = hovered ? values.length - 1 - hovered.index : 0;

  return (
    <div className="relative shrink-0">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Uso de GPU en el último minuto; ahora ${last.value} %`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} stroke="var(--color-line)" strokeWidth={1} />
        <path d={area} fill="var(--color-highlight)" fillOpacity={0.1} />
        <path d={line} fill="none" stroke="var(--color-highlight)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hovered && (
          <line x1={x(hovered.index)} x2={x(hovered.index)} y1={PAD} y2={H - PAD} stroke="var(--color-muted)" strokeWidth={1} />
        )}
        <circle
          cx={x((hovered ?? last).index)}
          cy={y((hovered ?? last).value)}
          r={4}
          fill="var(--color-highlight)"
          stroke="white"
          strokeWidth={2}
        />
      </svg>
      {hovered && (
        <div className="pointer-events-none absolute -top-7 right-0 rounded bg-ink px-2 py-0.5 text-sm whitespace-nowrap text-white">
          <strong>{hovered.value} %</strong> {secondsAgo === 0 ? "ahora" : `hace ${secondsAgo} s`}
        </div>
      )}
    </div>
  );
}
