/**
 * Format interne standardisé d'une séance structurée.
 *
 * Les intensités sont exprimées en FRACTION de la référence de puissance de l'athlète
 * (FTP confirmée, sinon CP estimée). Elles ne sont converties en watts qu'au moment de
 * l'affichage / de l'export, à partir des références réelles : jamais d'une FTP inventée.
 * Sans référence, la séance reste prescrite au RPE (échelle 1-10) et en zones de FC.
 */
export type StepKind = "warmup" | "steady" | "interval" | "recovery" | "cooldown" | "sprint";

export interface Step {
  kind: StepKind;
  durationS: number;
  low: number; // fraction de la référence (0.55 = 55 %)
  high: number;
  rpe: number; // 1-10
  cadence?: [number, number];
  label?: string;
}

export interface Repeat {
  kind: "repeat";
  count: number;
  steps: Step[];
}

export type Block = Step | Repeat;

export type Intensity = "low" | "moderate" | "high";

export interface WorkoutSpec {
  templateId: string;
  title: string;
  category: string;
  objective: string;
  rationale: string;
  successCriteria: string[];
  adaptations: string[];
  technique?: string;
  intensity: Intensity;
  priority: 1 | 2 | 3;
  indoorFriendly: boolean;
  blocks: Block[];
}

export function isRepeat(b: Block): b is Repeat {
  return b.kind === "repeat";
}

export function flatten(blocks: Block[]): Step[] {
  return blocks.flatMap((b) => (isRepeat(b) ? Array.from({ length: b.count }, () => b.steps).flat() : [b]));
}

export function totalDurationS(blocks: Block[]): number {
  return flatten(blocks).reduce((s, x) => s + x.durationS, 0);
}

/** TSS prévu ≈ Σ heures × IF² × 100 (IF pris au milieu de la cible). */
export function estimateTss(blocks: Block[]): number {
  const v = flatten(blocks).reduce((s, x) => {
    const IF = (x.low + x.high) / 2;
    return s + (x.durationS / 3600) * IF * IF * 100;
  }, 0);
  return Math.round(v);
}

/** Temps passé au-dessus d'un seuil d'intensité (pour les règles de sécurité). */
export function secondsAbove(blocks: Block[], fraction: number): number {
  return flatten(blocks).filter((s) => s.low >= fraction).reduce((a, s) => a + s.durationS, 0);
}
