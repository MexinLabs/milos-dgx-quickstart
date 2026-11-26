// Small shared pieces: buttons, cards, icons, number formatting.

import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode, type SVGProps } from "react";
import type { ChatEnd } from "../lib/api";
import { steadyRate } from "../lib/metrics";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

const number = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

export function fmt(value: number | null | undefined, unit = ""): string {
  if (value === null || value === undefined) return "–";
  return number.format(value) + (unit ? ` ${unit}` : "");
}

export function fmtDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "–";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${number.format(ms / 1000)} s`;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" };

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 font-semibold transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-brand text-white hover:bg-highlight",
        variant === "secondary" && "border border-line bg-white text-ink hover:border-brand hover:text-brand",
        variant === "danger" && "bg-danger text-white hover:opacity-90",
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx("rounded-xl border border-line bg-white", className)}>{children}</section>;
}

/** An example prompt: one click fills the input. */
export function Chip({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cx(
        "rounded-full border border-line bg-white px-3 py-1 text-left text-sm text-ink transition-colors hover:border-brand hover:bg-brand-soft disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="flex gap-2 rounded-lg border border-danger bg-danger-soft px-3 py-2 text-danger">
      <Icon name="alert" className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

/** Shown before the first token. A cold model can take a while, so say why. */
export function Waiting({ what = "Esperando al modelo" }: { what?: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <p className="text-muted">
      <span className="dots">{what}</span>
      {slow && <span className="block text-sm">La primera respuesta tarda más: el modelo se está cargando en memoria.</span>}
    </p>
  );
}

/** The numbers of one finished model call. */
export function StreamStats({ end }: { end: ChatEnd }) {
  return (
    <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm text-muted">
      <div className="font-mono text-ink">{end.model}</div>
      <Stat label="tokens/s" value={fmt(steadyRate(end.tokens_per_s, end.usage.completion_tokens))} strong />
      <Stat label="primer token" value={fmtDuration(end.ttft_ms)} />
      <Stat label="tokens" value={fmt(end.usage.completion_tokens)} />
      <Stat label="total" value={fmtDuration(end.total_ms)} />
    </dl>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dd className={cx("text-ink", strong ? "text-base font-bold" : "font-semibold")}>{value}</dd>
      <dt>{label}</dt>
    </div>
  );
}

const ICONS = {
  send: "M4 12l16-8-6 16-3-7-7-1z",
  stop: "M7 7h10v10H7z",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9.5a1 1 0 1 0 0-.01",
  agent: "M9 3h6M12 3v3M6 6h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM9 12v1.5M15 12v1.5M9 16.5h6",
  tool: "M14.5 6.5a4 4 0 0 0-5.3 5.2L4 17v3h3l5.3-5.2a4 4 0 0 0 5.2-5.3L15 12l-3-3z",
  check: "M5 12.5l4.5 4.5L19 7.5",
  alert: "M12 4l9 16H3zM12 10v4.5M12 17.5v.01",
  arrow: "M5 12h14M13 6l6 6-6 6",
  retry: "M4 12a8 8 0 1 0 2.6-5.9M4 4v5h5",
  play: "M7 5l12 7-12 7z",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={ICONS[name]} />
    </svg>
  );
}
