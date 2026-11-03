/**
 * Analyses fréquence cardiaque.
 * Découplage aérobie (Pw:HR) : ratio puissance/FC de la 1re moitié vs 2e moitié.
 *   découplage % = (R1 − R2) / R1 × 100, avec R = P̄ / FC̄.
 * Interprétation usuelle : < 5 % sur un effort stable = bonne endurance aérobie.
 * Pertinent uniquement sur un effort à intensité stable, sans longues pauses, > 20 min.
 */
import { mean } from "./power";

export function aerobicDecoupling(power: number[], hr: number[]): number | null {
  const n = Math.min(power.length, hr.length);
  if (n < 1200) return null;
  const half = Math.floor(n / 2);
  const p1 = mean(power.slice(0, half)), p2 = mean(power.slice(half, n));
  const h1 = mean(hr.slice(0, half).filter((x) => x > 0)), h2 = mean(hr.slice(half, n).filter((x) => x > 0));
  if (!h1 || !h2 || !p1) return null;
  const r1 = p1 / h1, r2 = p2 / h2;
  return ((r1 - r2) / r1) * 100;
}

/** Dérive cardiaque (%) à puissance quasi constante : FC̄ 2e moitié vs 1re. */
export function heartRateDrift(hr: number[]): number | null {
  const v = hr.filter((x) => x > 0);
  if (v.length < 600) return null;
  const half = Math.floor(v.length / 2);
  const h1 = mean(v.slice(0, half)), h2 = mean(v.slice(half));
  return ((h2 - h1) / h1) * 100;
}

/**
 * hrTSS approximatif, utilisé SEULEMENT sans puissance et si un seuil cardiaque (LTHR) est connu.
 * hrTSS ≈ heures × (FC̄ / LTHR)² × 100. Approximation grossière, signalée comme telle.
 */
export function hrTss(durationS: number, avgHr: number, lthr: number): number {
  return (durationS / 3600) * (avgHr / lthr) ** 2 * 100;
}
