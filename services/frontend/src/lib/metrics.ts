// Tokens per second for the GPU panel, fed by whichever tab is generating.
//
// While a stream is running the rate is estimated from the chunks that arrived
// in the last second (the server sends about one token per chunk). When the
// stream ends, the backend's measured value replaces the estimate.

import { useSyncExternalStore } from "react";

export type TokenRate = {
  live: boolean;
  tokensPerS: number | null;
  model: string | null;
};

const WINDOW_MS = 1000;

// A call that generates a handful of tokens (a tool call, a one-word answer)
// is too short to time: its tokens/s says nothing about the model's speed.
const MIN_TOKENS = 20;

/** The measured rate of a finished call, or null when the call was too short to mean anything. */
export function steadyRate(tokensPerS: number | null, tokens: number | null): number | null {
  return tokens !== null && tokens >= MIN_TOKENS ? tokensPerS : null;
}

let rate: TokenRate = { live: false, tokensPerS: null, model: null };
let stamps: number[] = [];
let burstStart: number | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function set(next: TokenRate) {
  rate = next;
  listeners.forEach((listener) => listener());
}

function tick() {
  const now = performance.now();
  stamps = stamps.filter((t) => now - t <= WINDOW_MS);
  if (stamps.length === 0) {
    // No chunk for a while: the stream ended or is waiting on a tool.
    if (timer) clearInterval(timer);
    timer = null;
    burstStart = null;
    if (rate.live) set({ ...rate, live: false });
    return;
  }
  // The first second of a burst is a partial window: wait until it fills.
  if (burstStart !== null && now - burstStart < WINDOW_MS) return;
  set({ ...rate, live: true, tokensPerS: stamps.length });
}

/** Call once per streamed chunk. */
export function reportToken() {
  const now = performance.now();
  if (burstStart === null) burstStart = now;
  stamps.push(now);
  if (!timer) timer = setInterval(tick, 250);
}

/** Call when a model call ends, with the backend's measured value. */
export function reportEnd(model: string, tokensPerS: number | null, tokens: number | null) {
  stamps = [];
  burstStart = null;
  const measured = steadyRate(tokensPerS, tokens);
  if (measured === null) return;
  set({ live: false, tokensPerS: measured, model });
}

export function useTokenRate(): TokenRate {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => rate,
  );
}
