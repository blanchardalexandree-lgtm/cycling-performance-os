/**
 * Analyse d'effort de contre-la-montre / effort soutenu.
 */
import { coefficientOfVariation, mean, normalizedPower, variabilityIndex } from "./power";
import { heartRateDrift } from "./heart";

export interface PacingAnalysis {
  durationS: number;
  avgPower: number;
  normalizedPower: number | null;
  variabilityIndex: number | null;
  powerCvPct: number | null; // sur moyennes 10 s
  quarters: { avgPower: number; avgHr: number | null; avgCadence: number | null }[];
  firstVsLastQuarterPct: number | null;
  hrDriftPct: number | null;
  cadenceCvPct: number | null;
  verdict: string[];
}

function chunkMeans(a: number[], size: number) {
  const out: number[] = [];
  for (let i = 0; i + size <= a.length; i += size) out.push(mean(a.slice(i, i + size)));
  return out;
}

export function analyzePacing(power: number[], hr: number[], cadence: number[]): PacingAnalysis | null {
  const n = power.length;
  if (n < 300) return null;
  const q = Math.floor(n / 4);
  const quarters = [0, 1, 2, 3].map((k) => {
    const s = k * q, e = k === 3 ? n : (k + 1) * q;
    const h = hr.slice(s, e).filter((x) => x > 0);
    const c = cadence.slice(s, e).filter((x) => x > 0);
    return { avgPower: round(mean(power.slice(s, e))), avgHr: h.length ? round(mean(h)) : null, avgCadence: c.length ? round(mean(c)) : null };
  });
  const avg = mean(power);
  const np = normalizedPower(power);
  const vi = np ? variabilityIndex(np, avg) : null;
  const cv = coefficientOfVariation(chunkMeans(power, 10));
  const pedaling = cadence.filter((x) => x > 0);
  const cadCv = pedaling.length > 60 ? coefficientOfVariation(pedaling) : null;
  const fl = quarters[0].avgPower > 0 ? ((quarters[3].avgPower - quarters[0].avgPower) / quarters[0].avgPower) * 100 : null;
  const drift = hr.some((x) => x > 0) ? heartRateDrift(hr) : null;
  const verdict: string[] = [];
  if (vi != null) verdict.push(vi <= 1.03 ? "Effort très régulier (VI ≤ 1,03)." : vi <= 1.06 ? "Régularité correcte (VI ≤ 1,06)." : "Effort irrégulier (VI > 1,06) : parcours, relances ou pacing à examiner.");
  if (fl != null) {
    if (fl < -8) verdict.push(`Baisse de ${Math.abs(fl).toFixed(0)} % entre le 1er et le dernier quart : départ probablement trop rapide.`);
    else if (fl > 5) verdict.push(`Fin plus forte de ${fl.toFixed(0)} % : marge possible au départ.`);
    else verdict.push("Répartition de l'effort homogène entre début et fin.");
  }
  return {
    durationS: n, avgPower: round(avg), normalizedPower: np ? round(np) : null, variabilityIndex: vi ? Math.round(vi * 1000) / 1000 : null,
    powerCvPct: cv ? round(cv) : null, quarters, firstVsLastQuarterPct: fl != null ? round(fl) : null,
    hrDriftPct: drift != null ? round(drift) : null, cadenceCvPct: cadCv ? round(cadCv) : null, verdict,
  };
}

function round(x: number) {
  return Math.round(x * 10) / 10;
}
