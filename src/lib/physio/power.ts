/**
 * Calculs de puissance déterministes.
 *
 * Toutes les fonctions travaillent sur des séries rééchantillonnées à 1 Hz.
 * Références :
 *  - Normalized Power (NP), IF, TSS : Coggan & Allen, "Training and Racing with a Power Meter".
 *    NP = (moyenne des (moyenne glissante 30 s)^4)^(1/4)
 *    IF = NP / FTP ; TSS = (durée_s × NP × IF) / (FTP × 3600) × 100
 *  - Puissance critique (modèle 2 paramètres, travail-temps) : Monod & Scherrer ; W = CP·t + W'.
 * Limites : NP/TSS n'ont de sens qu'avec une FTP fiable ; les valeurs sont nulles sinon.
 */

export const STANDARD_DURATIONS = [
  1, 5, 10, 15, 30, 60, 120, 180, 300, 480, 600, 720, 1200, 1800, 2400, 3600, 5400, 7200,
] as const;

/** Rééchantillonne à 1 Hz. Les trous ≤ maxGapS sont interpolés ; au-delà, remplis par `fill`. */
export function toOneHz(time: number[], values: (number | null | undefined)[], opts: { maxGapS?: number; fill?: number } = {}): number[] {
  const maxGap = opts.maxGapS ?? 5;
  const fill = opts.fill ?? 0;
  if (time.length === 0) return [];
  const t0 = time[0];
  const n = Math.round(time[time.length - 1] - t0) + 1;
  const out = new Array<number>(n).fill(fill);
  for (let i = 0; i < time.length; i++) {
    const v = values[i];
    if (v == null || Number.isNaN(v)) continue;
    const idx = Math.round(time[i] - t0);
    out[idx] = v;
    if (i > 0) {
      const prevV = values[i - 1];
      const prevIdx = Math.round(time[i - 1] - t0);
      const gap = idx - prevIdx;
      if (prevV != null && gap > 1 && gap <= maxGap) {
        for (let k = 1; k < gap; k++) out[prevIdx + k] = prevV + ((v - prevV) * k) / gap;
      }
    }
  }
  return out;
}

export function mean(a: number[]): number {
  if (a.length === 0) return 0;
  let s = 0;
  for (const v of a) s += v;
  return s / a.length;
}

export function rollingMean(a: number[], window: number): number[] {
  if (window <= 0 || a.length < window) return [];
  const out: number[] = [];
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    s += a[i];
    if (i >= window) s -= a[i - window];
    if (i >= window - 1) out.push(s / window);
  }
  return out;
}

/** Meilleure puissance moyenne sur `durationS` secondes (null si l'activité est plus courte). */
export function bestAverage(power: number[], durationS: number): number | null {
  if (durationS <= 0 || power.length < durationS) return null;
  let s = 0;
  for (let i = 0; i < durationS; i++) s += power[i];
  let best = s;
  for (let i = durationS; i < power.length; i++) {
    s += power[i] - power[i - durationS];
    if (s > best) best = s;
  }
  return best / durationS;
}

export function meanMaxCurve(power: number[], durations: readonly number[] = STANDARD_DURATIONS): { durationS: number; watts: number }[] {
  const out: { durationS: number; watts: number }[] = [];
  for (const d of durations) {
    const w = bestAverage(power, d);
    if (w != null) out.push({ durationS: d, watts: Math.round(w * 10) / 10 });
  }
  return out;
}

export function normalizedPower(power: number[]): number | null {
  const r = rollingMean(power, 30);
  if (r.length === 0) return null;
  let s = 0;
  for (const v of r) s += v ** 4;
  return (s / r.length) ** 0.25;
}

export function intensityFactor(np: number, ftp: number): number {
  return np / ftp;
}

export function trainingStressScore(durationS: number, np: number, ftp: number): number {
  const IF = np / ftp;
  return ((durationS * np * IF) / (ftp * 3600)) * 100;
}

export function variabilityIndex(np: number, avg: number): number | null {
  return avg > 0 ? np / avg : null;
}

export function workKj(power: number[]): number {
  let s = 0;
  for (const p of power) s += p;
  return s / 1000;
}

export interface CriticalPowerFit {
  cp: number;
  wPrime: number; // joules
  r2: number;
  cpSe: number; // erreur standard sur CP
  wPrimeSe: number;
  points: { durationS: number; watts: number }[];
}

/**
 * Ajuste le modèle CP 2 paramètres (W = CP·t + W') par moindres carrés sur des efforts
 * maximaux entre 2 et 20 minutes. Requiert ≥ 3 durées distinctes ; sinon null.
 * Fiabilité réelle conditionnée au caractère maximal des efforts (à confirmer par test).
 */
export function fitCriticalPower(bests: { durationS: number; watts: number }[], minS = 120, maxS = 1200): CriticalPowerFit | null {
  const pts = bests.filter((b) => b.durationS >= minS && b.durationS <= maxS && b.watts > 0);
  const uniq = new Map<number, number>();
  for (const p of pts) uniq.set(p.durationS, Math.max(uniq.get(p.durationS) ?? 0, p.watts));
  const data = [...uniq.entries()].map(([t, w]) => ({ t, W: t * w, watts: w }));
  if (data.length < 3) return null;
  const n = data.length;
  const mt = data.reduce((s, d) => s + d.t, 0) / n;
  const mW = data.reduce((s, d) => s + d.W, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const d of data) {
    sxx += (d.t - mt) ** 2;
    sxy += (d.t - mt) * (d.W - mW);
    syy += (d.W - mW) ** 2;
  }
  if (sxx === 0) return null;
  const cp = sxy / sxx;
  const wPrime = mW - cp * mt;
  let sse = 0;
  for (const d of data) sse += (d.W - (cp * d.t + wPrime)) ** 2;
  const r2 = syy === 0 ? 1 : 1 - sse / syy;
  const s2 = n > 2 ? sse / (n - 2) : 0;
  const cpSe = Math.sqrt(s2 / sxx);
  const wPrimeSe = Math.sqrt(s2 * (1 / n + (mt * mt) / sxx));
  if (cp <= 0 || wPrime <= 0) return null;
  return { cp, wPrime, r2, cpSe, wPrimeSe, points: data.map((d) => ({ durationS: d.t, watts: d.watts })) };
}

/** Puissance soutenable prédite par le modèle CP pour une durée (valable ~2-30 min). */
export function cpPredict(fit: { cp: number; wPrime: number }, durationS: number): number {
  return fit.cp + fit.wPrime / durationS;
}

/** Coefficient de variation (%) d'une série. */
export function coefficientOfVariation(a: number[]): number | null {
  const m = mean(a);
  if (m === 0 || a.length < 2) return null;
  let s = 0;
  for (const v of a) s += (v - m) ** 2;
  return (Math.sqrt(s / (a.length - 1)) / m) * 100;
}
