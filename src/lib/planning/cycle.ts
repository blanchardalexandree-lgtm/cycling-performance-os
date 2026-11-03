/**
 * Moteur de planification : cycle de référence 3 jours d'entraînement + 1 jour de récupération active.
 *
 * Principes appliqués (pur, déterministe, testé) :
 *  - Le cycle n'est PAS calé sur la semaine : il glisse dans le calendrier.
 *  - Une course occupe sa journée ; le lendemain de la (dernière) journée de course est une
 *    récupération active, puis le cycle redémarre au jour 1. Veille de course = déblocage.
 *  - Jamais deux séances « high » consécutives ; pas de séance clé dans les 2 jours précédant
 *    une course (hors déblocage).
 *  - La durée de chaque séance respecte le temps disponible du jour ; si l'objectif ne tient
 *    pas, une variante courte cohérente est choisie (cf. buildWorkout).
 *  - Les phases dépendent des objectifs A/B (individualisé par la date et le type d'objectif).
 *  - Un cycle sur quatre est un cycle d'assimilation (charge réduite).
 *  - Pas de journée off par défaut ; une journée off n'apparaît que si une contrainte l'impose
 *    (ou, plus tard, sur proposition du moteur de sécurité validée par l'athlète).
 */
import { buildWorkout } from "./library";
import type { WorkoutSpec } from "./types";
import { estimateTss, totalDurationS } from "./types";

export type Phase = "general" | "development" | "specific" | "competition" | "taper" | "transition";

export const PHASE_LABEL: Record<Phase, string> = {
  general: "Développement général",
  development: "Développement physiologique",
  specific: "Spécialisation",
  competition: "Période de compétition",
  taper: "Affûtage",
  transition: "Reprise / transition",
};

export interface PlanGoal {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  endDate?: string | null;
  priority: "A" | "B" | "C";
  kind: string; // course, clm, etapes, stage (stage = stage d'entraînement, pas une course)
  demands?: string[];
}

export interface PlanConstraint {
  start: string;
  end: string;
  maxTrainingMin?: number | null;
  indoorOnly?: boolean;
  noTraining?: boolean;
  title: string;
}

export interface PlanInput {
  start: string;
  end: string;
  /** Un jour 1 de cycle connu (sinon `start`). */
  anchor?: string;
  goals: PlanGoal[];
  constraints: PlanConstraint[];
  /** minutes disponibles par jour de semaine, 0 = lundi */
  weeklyMinutes: number[];
  /** dates déjà occupées par une séance verrouillée / réalisée : le planificateur ne les touche pas */
  lockedDates?: string[];
  /** date de la dernière référence de puissance MESURÉE (pour proposer un test si trop ancienne) */
  lastMeasuredRefDate?: string | null;
}

export type DayRole = "TRAINING" | "ACTIVE_RECOVERY" | "RACE" | "TEST" | "OFF";

export interface PlannedDay {
  date: string;
  role: DayRole;
  cycleIndex: number | null;
  phase: Phase;
  assimilation: boolean;
  availableMin: number;
  indoor: boolean;
  goalId?: string;
  note?: string;
  workout: (WorkoutSpec & { durationMin: number; plannedTss: number }) | null;
}

const DAY = 86400_000;
export const toDate = (s: string) => new Date(s + "T00:00:00.000Z");
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (s: string, n: number) => iso(new Date(toDate(s).getTime() + n * DAY));
export const diffDays = (a: string, b: string) => Math.round((toDate(a).getTime() - toDate(b).getTime()) / DAY);
const weekday = (s: string) => (toDate(s).getUTCDay() + 6) % 7;

const isRaceGoal = (g: PlanGoal) => g.kind !== "stage" && g.kind !== "objectif";
const goalEnd = (g: PlanGoal) => g.endDate ?? g.date;
const isTT = (g: PlanGoal) => g.kind === "clm" || /clm|contre/i.test(g.name) || (g.demands ?? []).includes("clm");

export function phaseFor(date: string, goals: PlanGoal[]): { phase: Phase; target?: PlanGoal } {
  const majors = goals.filter((g) => isRaceGoal(g) && (g.priority === "A" || g.priority === "B"));
  const recentA = goals.filter((g) => isRaceGoal(g) && g.priority === "A" && diffDays(date, goalEnd(g)) > 0 && diffDays(date, goalEnd(g)) <= 4);
  if (recentA.length) return { phase: "transition", target: recentA[0] };
  const nextA = goals.filter((g) => isRaceGoal(g) && g.priority === "A" && diffDays(g.date, date) >= 0).sort((a, b) => a.date.localeCompare(b.date))[0];
  const nextMajor = majors.filter((g) => diffDays(g.date, date) >= 0).sort((a, b) => a.date.localeCompare(b.date))[0];
  const anyRaceSoon = goals.some((g) => isRaceGoal(g) && diffDays(g.date, date) >= 0 && diffDays(g.date, date) <= 7);
  if (nextA) {
    const d = diffDays(nextA.date, date);
    if (d <= 9) return { phase: "taper", target: nextA };
    if (d <= 35) return { phase: "specific", target: nextA };
  }
  if (nextMajor && nextMajor.priority === "B" && diffDays(nextMajor.date, date) <= 5) return { phase: "taper", target: nextMajor };
  if (anyRaceSoon) return { phase: "competition", target: nextMajor ?? nextA };
  if (nextA && diffDays(nextA.date, date) <= 120) return { phase: "development", target: nextA };
  return { phase: "general", target: nextA ?? nextMajor };
}

/** Séance type pour un jour d'entraînement selon la phase et la position dans le cycle. */
export function sessionFor(phase: Phase, pos: 1 | 2 | 3, cycleNo: number, target: PlanGoal | undefined, assimilation: boolean): string {
  const tt = target ? isTT(target) : false;
  const alt = cycleNo % 2 === 0;
  if (assimilation) return pos === 1 ? "tempo" : pos === 2 ? "endurance" : "cadence";
  switch (phase) {
    case "general":
      return pos === 1 ? (alt ? "sweetspot" : "force") : pos === 2 ? "endurance" : alt ? "endurance_longue" : "tempo";
    case "development":
      return pos === 1 ? (alt ? "seuil" : "vo2") : pos === 2 ? (alt ? "force" : "endurance") : alt ? "pma_30_15" : tt ? "sweetspot" : "endurance_longue";
    case "specific":
      return pos === 1 ? (tt ? "clm_specifique" : alt ? "repetition" : "seuil") : pos === 2 ? "endurance" : tt ? (alt ? "vo2" : "seuil") : alt ? "over_under" : "endurance_longue";
    case "competition":
      return pos === 1 ? (alt ? "vo2" : tt ? "clm_specifique" : "over_under") : pos === 2 ? "endurance" : "sprint";
    case "taper":
      return pos === 1 ? (tt ? "clm_specifique" : "vo2") : pos === 2 ? "endurance" : "cadence";
    case "transition":
      return pos === 3 ? "cadence" : "endurance";
  }
}

const VOLUME_FACTOR: Record<Phase, number> = { general: 1, development: 1, specific: 0.95, competition: 0.85, taper: 0.6, transition: 0.6 };

function recoveryMinutes(available: number, phase: Phase): number {
  const base = phase === "taper" ? 40 : 50;
  return Math.max(20, Math.min(available, base));
}

export function generatePlan(input: PlanInput): PlannedDay[] {
  const out: PlannedDay[] = [];
  const locked = new Set(input.lockedDates ?? []);
  const raceDays = new Map<string, PlanGoal>();
  const campDays = new Map<string, PlanGoal>();
  for (const g of input.goals) {
    const n = diffDays(goalEnd(g), g.date);
    for (let i = 0; i <= n; i++) (isRaceGoal(g) ? raceDays : campDays).set(addDays(g.date, i), g);
  }
  const constraintFor = (d: string) => input.constraints.filter((c) => d >= c.start.slice(0, 10) && d <= c.end.slice(0, 10));

  // Position initiale : si une ancre est fournie, on prolonge sa logique.
  let pos = 1;
  if (input.anchor) pos = (((diffDays(input.start, input.anchor) % 4) + 4) % 4) + 1;
  let cycleNo = 0;
  let lastTest: string | null = input.lastMeasuredRefDate ?? null;
  let prevHigh = false;

  for (let d = input.start; d <= input.end; d = addDays(d, 1)) {
    const { phase, target } = phaseFor(d, input.goals);
    const cons = constraintFor(d);
    const camp = campDays.get(d);
    const weekdayMin = input.weeklyMinutes[weekday(d)] ?? 90;
    const capped = cons.reduce((min, c) => (c.maxTrainingMin != null ? Math.min(min, c.maxTrainingMin) : min), camp ? Math.max(weekdayMin, 240) : weekdayMin);
    const indoor = cons.some((c) => c.indoorOnly);
    const assimilation = cycleNo % 4 === 3 && phase !== "taper" && phase !== "transition";
    const day: PlannedDay = { date: d, role: "TRAINING", cycleIndex: null, phase, assimilation, availableMin: capped, indoor, workout: null };

    if (locked.has(d)) {
      // Séance verrouillée : on conserve la logique du cycle sans la modifier.
      day.note = "Séance verrouillée conservée";
      out.push(day);
      pos = pos === 4 ? 1 : pos + 1;
      if (pos === 1) cycleNo++;
      prevHigh = false;
      continue;
    }

    const race = raceDays.get(d);
    const raceTomorrow = raceDays.get(addDays(d, 1));
    const raceIn2 = raceDays.get(addDays(d, 2));
    const raceYesterday = raceDays.get(addDays(d, -1));

    if (race) {
      day.role = "RACE";
      day.goalId = race.id;
      day.note = race.name;
      out.push(day);
      pos = 4; // le lendemain (hors course) sera une récupération active
      prevHigh = true;
      continue;
    }
    if (cons.some((c) => c.noTraining)) {
      day.role = "OFF";
      day.note = cons.find((c) => c.noTraining)!.title;
      out.push(day);
      pos = 1;
      prevHigh = false;
      continue;
    }
    if (raceYesterday || pos === 4) {
      day.role = "ACTIVE_RECOVERY";
      day.cycleIndex = 4;
      const w = buildWorkout("recup_active", recoveryMinutes(capped, phase));
      day.workout = w ? withTotals(w) : null;
      if (raceYesterday) day.note = `Récupération après ${raceYesterday.name}`;
      out.push(day);
      pos = 1;
      cycleNo++;
      prevHigh = false;
      continue;
    }

    day.cycleIndex = pos;
    let templateId: string;
    if (raceTomorrow) {
      templateId = "opener";
      day.note = `Veille de ${raceTomorrow.name}`;
    } else if (raceIn2) {
      templateId = "endurance";
    } else {
      templateId = sessionFor(phase, pos as 1 | 2 | 3, cycleNo, target, assimilation);
      // Test de référence si aucune mesure depuis 8 semaines (max 1 / 6 semaines), en phase de développement.
      const needTest = (!lastTest || diffDays(d, lastTest) > 56) && pos === 1 && (phase === "general" || phase === "development");
      const raceSoon = input.goals.some((g) => isRaceGoal(g) && diffDays(g.date, d) >= 0 && diffDays(g.date, d) <= 6);
      if (needTest && !raceSoon && !assimilation && capped >= 75) {
        templateId = "test_20";
        day.role = "TEST";
        lastTest = d;
      }
      if (camp && pos !== 1) templateId = "endurance_longue";
    }

    const minutes = Math.round(Math.min(capped, 600) * (templateId === "test_20" ? 1 : VOLUME_FACTOR[phase] * (assimilation ? 0.75 : 1)));
    let w = buildWorkout(templateId, Math.max(minutes, 30));
    if (w && w.intensity === "high" && prevHigh) w = buildWorkout("endurance", Math.max(minutes, 45));
    if (!w) w = buildWorkout("endurance", Math.max(capped, 45)) ?? buildWorkout("recup_active", Math.max(capped, 20));
    day.workout = w ? withTotals(w) : null;
    prevHigh = w?.intensity === "high";
    out.push(day);
    pos++;
  }
  return out;
}

function withTotals(w: WorkoutSpec) {
  return { ...w, durationMin: Math.round(totalDurationS(w.blocks) / 60), plannedTss: estimateTss(w.blocks) };
}

/** Phases contiguës (pour la timeline de saison). */
export function summarizePhases(days: PlannedDay[]): { phase: Phase; start: string; end: string }[] {
  const out: { phase: Phase; start: string; end: string }[] = [];
  for (const d of days) {
    const last = out[out.length - 1];
    if (last && last.phase === d.phase && diffDays(d.date, last.end) === 1) last.end = d.date;
    else out.push({ phase: d.phase, start: d.date, end: d.date });
  }
  return out;
}

/**
 * Règles de cohérence d'une séquence (utilisées pour valider toute modification manuelle,
 * du moteur d'adaptation ou du coach IA). Renvoie la liste des violations.
 */
export function validateSequence(days: { date: string; role: DayRole; intensity?: string | null }[], raceDates: string[]): string[] {
  const issues: string[] = [];
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1], b = sorted[i];
    if (diffDays(b.date, a.date) === 1 && a.intensity === "high" && b.intensity === "high") {
      issues.push(`Deux séances très exigeantes consécutives (${a.date} et ${b.date}).`);
    }
  }
  let streak = 0;
  for (let i = 0; i < sorted.length; i++) {
    const d = sorted[i];
    const consecutive = i > 0 && diffDays(d.date, sorted[i - 1].date) === 1;
    streak = d.role === "ACTIVE_RECOVERY" || d.role === "OFF" ? 0 : consecutive ? streak + 1 : 1;
    if (streak > 5) {
      issues.push(`Plus de 5 jours consécutifs sans récupération autour du ${d.date}.`);
      streak = 0;
    }
  }
  for (const r of raceDates) {
    for (const d of sorted) {
      const gap = diffDays(r, d.date);
      if ((gap === 1 || gap === 2) && d.intensity === "high") issues.push(`Séance très exigeante le ${d.date}, ${gap} jour(s) avant une course.`);
    }
  }
  return issues;
}
