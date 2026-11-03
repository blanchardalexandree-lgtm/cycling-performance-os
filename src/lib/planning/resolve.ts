import type { Block, Step } from "./types";
import { isRepeat } from "./types";

export interface ResolvedStep extends Step {
  wattsLow: number | null;
  wattsHigh: number | null;
  hrHint: string | null;
}

export interface ResolvedRepeat {
  kind: "repeat";
  count: number;
  steps: ResolvedStep[];
}

const HR_HINT = (low: number) =>
  low < 0.56 ? "Z1 FC" : low < 0.76 ? "Z2 FC" : low < 0.88 ? "Z3 FC" : low < 0.95 ? "Z3-Z4 FC" : low < 1.06 ? "Z4-Z5 FC" : "FC non pertinente (effort court)";

/** Convertit les fractions en watts SEULEMENT si une référence réelle est fournie. */
export function resolveBlocks(blocks: Block[], refWatts: number | null): (ResolvedStep | ResolvedRepeat)[] {
  const one = (s: Step): ResolvedStep => ({
    ...s,
    wattsLow: refWatts && s.kind !== "sprint" ? Math.round(s.low * refWatts) : null,
    wattsHigh: refWatts && s.kind !== "sprint" ? Math.round(s.high * refWatts) : null,
    hrHint: HR_HINT(s.low),
  });
  return blocks.map((b) => (isRepeat(b) ? { kind: "repeat" as const, count: b.count, steps: b.steps.map(one) } : one(b)));
}

export function formatDuration(s: number): string {
  if (s < 60) return `${Math.round(s)} s`;
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

export function stepLabel(s: Step): string {
  const pct = s.kind === "sprint" ? "sprint maximal" : `${Math.round(s.low * 100)}-${Math.round(s.high * 100)} %`;
  return `${formatDuration(s.durationS)} ${s.label ?? s.kind} · ${pct}${s.cadence ? ` · ${s.cadence[0]}-${s.cadence[1]} rpm` : ""}`;
}
