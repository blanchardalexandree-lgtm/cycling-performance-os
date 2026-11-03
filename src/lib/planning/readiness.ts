/**
 * Moteur de règles de sécurité : état de forme multi-indicateurs.
 *
 * Jamais un seul indicateur : un signal « orange » demande au moins deux indicateurs concordants.
 * Exceptions immédiates (« rouge ») : maladie déclarée, douleur inhabituelle.
 * Les seuils sont des repères prudents, documentés, et non des diagnostics médicaux.
 */
export interface WellnessDay {
  date: string;
  hrvMs?: number | null;
  restingHr?: number | null;
  sleepHours?: number | null;
  sleepQuality?: number | null;
  fatigue?: number | null; // 1-5
  soreness?: number | null; // 1-5
  illness?: boolean;
  pain?: string | null;
}

export interface ReadinessSignal {
  indicator: string;
  observed: string;
  baseline?: string;
  kind: "observé" | "estimé";
  weight: number; // 1 = signal faible, 2 = fort
}

export type ReadinessLevel = "green" | "amber" | "red" | "stop";

export interface Readiness {
  level: ReadinessLevel;
  signals: ReadinessSignal[];
  recommendation: string;
  loadFactor: number; // multiplicateur de charge recommandé pour les prochains jours
  dataCoverage: string[];
}

const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const sd = (a: number[]) => {
  const m = avg(a);
  if (m == null || a.length < 3) return null;
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};

export function assessReadiness(history: WellnessDay[], load: { tsb?: number | null; ramp?: number | null } = {}): Readiness {
  const days = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const today = days[days.length - 1];
  const prior = days.slice(0, -1).slice(-28);
  const signals: ReadinessSignal[] = [];
  const coverage: string[] = [];

  if (today?.illness) {
    return { level: "stop", signals: [{ indicator: "Maladie déclarée", observed: "oui", kind: "observé", weight: 3 }], recommendation: "Journée sans vélo recommandée. Reprendre progressivement après disparition des symptômes ; consulter si fièvre ou symptômes thoraciques.", loadFactor: 0, dataCoverage: ["déclaration"] };
  }
  if (today?.pain) {
    signals.push({ indicator: "Douleur déclarée", observed: today.pain, kind: "observé", weight: 3 });
  }

  // HRV : comparaison à la moyenne 28 j (± 1 écart-type) — méthode « smallest worthwhile change » simplifiée.
  const hrvHist = prior.map((d) => d.hrvMs).filter((x): x is number => x != null);
  if (today?.hrvMs != null && hrvHist.length >= 7) {
    coverage.push("HRV");
    const m = avg(hrvHist)!, s = sd(hrvHist) ?? m * 0.1;
    const recent = days.slice(-3).map((d) => d.hrvMs).filter((x): x is number => x != null);
    const r = avg(recent)!;
    if (r < m - s) signals.push({ indicator: "HRV (moyenne 3 j)", observed: `${r.toFixed(0)} ms`, baseline: `${m.toFixed(0)} ± ${s.toFixed(0)} ms`, kind: "observé", weight: r < m - 2 * s ? 2 : 1 });
  }
  const rhrHist = prior.map((d) => d.restingHr).filter((x): x is number => x != null);
  if (today?.restingHr != null && rhrHist.length >= 7) {
    coverage.push("FC repos");
    const m = avg(rhrHist)!;
    if (today.restingHr >= m + 5) signals.push({ indicator: "FC de repos", observed: `${today.restingHr} bpm`, baseline: `${m.toFixed(0)} bpm`, kind: "observé", weight: today.restingHr >= m + 8 ? 2 : 1 });
  }
  const sleep = days.slice(-3).map((d) => d.sleepHours).filter((x): x is number => x != null);
  if (sleep.length) {
    coverage.push("sommeil");
    const s = avg(sleep)!;
    if (s < 6.5) signals.push({ indicator: "Sommeil (3 nuits)", observed: `${s.toFixed(1)} h`, baseline: "≥ 7 h", kind: "observé", weight: s < 5.5 ? 2 : 1 });
  }
  if (today?.fatigue != null) {
    coverage.push("fatigue perçue");
    if (today.fatigue >= 4) signals.push({ indicator: "Fatigue perçue", observed: `${today.fatigue}/5`, kind: "observé", weight: today.fatigue === 5 ? 2 : 1 });
  }
  if (today?.soreness != null && today.soreness >= 4) signals.push({ indicator: "Courbatures", observed: `${today.soreness}/5`, kind: "observé", weight: 1 });
  if (load.tsb != null) {
    coverage.push("charge (TSB)");
    if (load.tsb < -30) signals.push({ indicator: "Fraîcheur (TSB)", observed: load.tsb.toFixed(0), baseline: "> −30", kind: "estimé", weight: load.tsb < -40 ? 2 : 1 });
  }
  if (load.ramp != null && load.ramp > 8) signals.push({ indicator: "Rampe de CTL", observed: `+${load.ramp.toFixed(1)} /7 j`, baseline: "≤ 8", kind: "estimé", weight: 1 });

  const score = signals.reduce((s, x) => s + x.weight, 0);
  const strong = signals.filter((s) => s.weight >= 2).length;
  const hasPain = signals.some((s) => s.indicator === "Douleur déclarée");

  let level: ReadinessLevel = "green";
  if (hasPain || score >= 5 || strong >= 2) level = "red";
  else if (signals.length >= 2 || score >= 3) level = "amber";

  const recommendation = {
    green: signals.length === 1 ? "Un signal isolé ne suffit pas à modifier le plan : séance maintenue, rester attentif aux sensations." : "Indicateurs cohérents avec la séance prévue.",
    amber: "Plusieurs indicateurs concordants : réduire l'intensité (remplacer une séance clé par de l'endurance) ou raccourcir de 30 %.",
    red: hasPain ? "Douleur inhabituelle : supprimer l'intensité, privilégier une récupération très courte ou une journée sans vélo. Avis d'un professionnel si elle persiste." : "Fatigue marquée sur plusieurs indicateurs : récupération active courte (20-30 min) ou journée sans vélo si nécessaire.",
    stop: "",
  }[level];
  const loadFactor = { green: 1, amber: 0.7, red: 0.3, stop: 0 }[level];
  return { level, signals, recommendation, loadFactor, dataCoverage: coverage };
}
