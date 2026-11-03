/**
 * Charge d'entraînement : modèle impulsion-réponse simplifié (Banister / PMC).
 *  CTL_t = CTL_{t-1} + (TSS_t − CTL_{t-1}) / 42   (charge chronique, « forme de fond »)
 *  ATL_t = ATL_{t-1} + (TSS_t − ATL_{t-1}) / 7    (charge aiguë, « fatigue »)
 *  TSB_t = CTL_{t-1} − ATL_{t-1}                   (fraîcheur, veille au matin)
 * Limites : ne reflète que la charge mesurée ; les jours sans TSS calculable (pas de puissance
 * ni de FC exploitable) sont comptés comme « inconnus » et signalés via `coverage`.
 */
export interface DailyLoad {
  date: string; // YYYY-MM-DD
  tss: number;
  unknownActivities: number;
}

export interface PmcPoint {
  date: string;
  tss: number;
  ctl: number;
  atl: number;
  tsb: number;
}

export function computePmc(days: DailyLoad[], init: { ctl: number; atl: number } = { ctl: 0, atl: 0 }): PmcPoint[] {
  let ctl = init.ctl;
  let atl = init.atl;
  const out: PmcPoint[] = [];
  for (const d of days) {
    const tsb = ctl - atl;
    ctl = ctl + (d.tss - ctl) / 42;
    atl = atl + (d.tss - atl) / 7;
    out.push({ date: d.date, tss: d.tss, ctl: round1(ctl), atl: round1(atl), tsb: round1(tsb) });
  }
  return out;
}

/** Remplit les jours manquants entre start et end (inclus). */
export function fillDays(byDate: Map<string, { tss: number; unknown: number }>, start: Date, end: Date): DailyLoad[] {
  const out: DailyLoad[] = [];
  for (let d = new Date(start); d <= end; d = addDaysUTC(d, 1)) {
    const k = isoDate(d);
    const v = byDate.get(k);
    out.push({ date: k, tss: v?.tss ?? 0, unknownActivities: v?.unknown ?? 0 });
  }
  return out;
}

/** Variation de CTL sur 7 jours (rampe). Au-delà de ~5-8/sem., risque accru (repère, pas une règle). */
export function rampRate(pmc: PmcPoint[]): number | null {
  if (pmc.length < 8) return null;
  return round1(pmc[pmc.length - 1].ctl - pmc[pmc.length - 8].ctl);
}

export function round1(x: number) {
  return Math.round(x * 10) / 10;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDaysUTC(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

export function parseISODate(s: string): Date {
  return new Date(s + "T00:00:00.000Z");
}
