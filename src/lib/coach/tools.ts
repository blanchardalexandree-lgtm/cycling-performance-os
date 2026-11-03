/**
 * Outils internes du coach. Le modèle de langage n'accède JAMAIS directement à la base :
 * il appelle ces fonctions, qui appliquent l'isolation utilisateur, les calculs déterministes
 * et les règles métier. La seule écriture possible est une PROPOSITION soumise à validation.
 *
 * Données Strava : exclues (politique API Strava sur l'usage IA). Une activité dont toutes les
 * sources sont restreintes n'est jamais transmise au modèle.
 */
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../db";
import { getReferences, powerReference, ORIGIN_LABEL } from "../references";
import { computePmc, fillDays, isoDate, rampRate } from "../physio/load";
import { fitCriticalPower, cpPredict } from "../physio/power";
import { assessReadiness } from "../planning/readiness";
import { ChangeSchema, checkChanges, describeChange } from "../planning/proposals";
import { TEMPLATES } from "../planning/library";
import { iso } from "../planning/cycle";

const aiVisible = { sources: { some: { restricted: false } } };

export async function loadSummary(userId: string, days = 90) {
  const end = new Date();
  const start = new Date(end.getTime() - (days + 42) * 86400_000);
  const acts = await prisma.activity.findMany({ where: { userId, startTime: { gte: start } }, select: { startTime: true, tss: true } });
  const by = new Map<string, { tss: number; unknown: number }>();
  for (const a of acts) {
    const k = isoDate(a.startTime);
    const v = by.get(k) ?? { tss: 0, unknown: 0 };
    if (a.tss != null) v.tss += a.tss; else v.unknown++;
    by.set(k, v);
  }
  const pmc = computePmc(fillDays(by, start, end));
  const last = pmc.at(-1);
  return { ctl: last?.ctl ?? null, atl: last?.atl ?? null, tsb: last?.tsb ?? null, ramp: rampRate(pmc), activitiesWithoutLoad: acts.filter((a) => a.tss == null).length, series: pmc.slice(-days) };
}

export async function readinessToday(userId: string) {
  const w = await prisma.wellnessEntry.findMany({ where: { userId }, orderBy: { date: "desc" }, take: 30 });
  const l = await loadSummary(userId, 30);
  return assessReadiness(w.map((x) => ({ ...x, date: iso(x.date) })), { tsb: l.tsb, ramp: l.ramp });
}

type Handler = (userId: string, input: unknown) => Promise<unknown>;

const DateRange = z.object({ from: z.string().optional(), to: z.string().optional() });

export const TOOLS: { def: Anthropic.Tool; run: Handler }[] = [
  {
    def: {
      name: "get_profile",
      description: "Profil sportif et références physiologiques actuelles (FTP, CP, W′, FC, poids), chacune avec provenance (mesuré/estimé/déclaré), date et méthode.",
      input_schema: { type: "object", properties: {}, additionalProperties: false },
    },
    run: async (userId) => {
      const [profile, refs] = await Promise.all([prisma.athleteProfile.findUnique({ where: { userId } }), getReferences(userId)]);
      const fmt = (r: Awaited<ReturnType<typeof getReferences>>[keyof Awaited<ReturnType<typeof getReferences>>]) =>
        r ? { value: r.value, unit: r.unit, origin: ORIGIN_LABEL[r.origin], date: iso(r.date), source: r.source, method: r.method, uncertainty: r.uncertainty } : "inconnu";
      return { profile, references: Object.fromEntries(Object.entries(refs).map(([k, v]) => [k, fmt(v)])), powerReferenceUsed: powerReference(refs) };
    },
  },
  {
    def: {
      name: "get_activities",
      description: "Liste des activités (hors données Strava) sur une période, avec durée, puissance moyenne/normalisée, FC, TSS et méthode de calcul.",
      input_schema: { type: "object", properties: { from: { type: "string", description: "YYYY-MM-DD" }, to: { type: "string" }, races_only: { type: "boolean" } }, additionalProperties: false },
    },
    run: async (userId, input) => {
      const { from, to, races_only } = DateRange.extend({ races_only: z.boolean().optional() }).parse(input ?? {});
      const acts = await prisma.activity.findMany({
        where: { userId, ...aiVisible, startTime: { gte: from ? new Date(from) : new Date(Date.now() - 28 * 86400_000), lte: to ? new Date(to + "T23:59:59Z") : undefined }, ...(races_only ? { isRace: true } : {}) },
        orderBy: { startTime: "desc" },
        take: 60,
        select: { id: true, name: true, startTime: true, durationS: true, distanceM: true, elevationGainM: true, avgPower: true, normalizedPower: true, avgHr: true, tss: true, tssMethod: true, intensityFactor: true, isRace: true, isIndoor: true, hrDriftPct: true },
      });
      const hidden = await prisma.activity.count({ where: { userId, sources: { every: { restricted: true } } } });
      return { activities: acts, note: hidden ? `${hidden} activité(s) issues uniquement de Strava ne sont pas accessibles au coach (politique API Strava).` : undefined };
    },
  },
  {
    def: {
      name: "get_power_records",
      description: "Meilleures puissances par durée (records) sur une période, en distinguant entraînement et course, et estimation du modèle CP 2 paramètres si possible.",
      input_schema: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, additionalProperties: false },
    },
    run: async (userId, input) => {
      const { from, to } = DateRange.parse(input ?? {});
      const rows = await prisma.powerBest.findMany({
        where: { userId, date: { gte: from ? new Date(from) : new Date(Date.now() - 90 * 86400_000), lte: to ? new Date(to + "T23:59:59Z") : undefined }, activity: aiVisible },
      });
      const best = new Map<number, { watts: number; date: string; race: boolean }>();
      for (const r of rows) if (!best.has(r.durationS) || best.get(r.durationS)!.watts < r.watts) best.set(r.durationS, { watts: r.watts, date: iso(r.date), race: r.isRace });
      const curve = [...best.entries()].sort((a, b) => a[0] - b[0]).map(([d, v]) => ({ durationS: d, ...v }));
      const cp = fitCriticalPower(curve.map((c) => ({ durationS: c.durationS, watts: c.watts })));
      return {
        curve,
        criticalPowerModel: cp ? { cp: Math.round(cp.cp), wPrime_kJ: Math.round(cp.wPrime / 100) / 10, r2: Math.round(cp.r2 * 1000) / 1000, cpUncertainty: Math.round(cp.cpSe), predicted20min: Math.round(cpPredict(cp, 1200)), status: "ESTIMATION — valable si les efforts utilisés étaient maximaux" } : "Données insuffisantes (≥ 3 efforts maximaux entre 2 et 20 min requis).",
      };
    },
  },
  {
    def: {
      name: "get_training_load",
      description: "Charge chronique (CTL), aiguë (ATL), fraîcheur (TSB), rampe sur 7 jours, et nombre d'activités sans charge calculable.",
      input_schema: { type: "object", properties: { days: { type: "integer", minimum: 7, maximum: 365 } }, additionalProperties: false },
    },
    run: async (userId, input) => {
      const { days } = z.object({ days: z.number().int().optional() }).parse(input ?? {});
      const s = await loadSummary(userId, days ?? 42);
      return { ...s, series: s.series.filter((_, i, a) => i % 7 === 0 || i === a.length - 1), formula: "CTL/ATL : moyennes exponentielles 42 j / 7 j du TSS ; TSB = CTL − ATL (veille)." };
    },
  },
  {
    def: {
      name: "get_readiness",
      description: "État de forme du jour (règles multi-indicateurs : HRV, FC repos, sommeil, fatigue, douleurs, TSB) avec les signaux observés et la recommandation du moteur de sécurité.",
      input_schema: { type: "object", properties: {}, additionalProperties: false },
    },
    run: async (userId) => readinessToday(userId),
  },
  {
    def: {
      name: "get_goals",
      description: "Objectifs et courses (priorité A/B/C, date, type, exigences, état de préparation).",
      input_schema: { type: "object", properties: { upcoming_only: { type: "boolean" } }, additionalProperties: false },
    },
    run: async (userId, input) => {
      const { upcoming_only } = z.object({ upcoming_only: z.boolean().optional() }).parse(input ?? {});
      return prisma.goal.findMany({ where: { userId, ...(upcoming_only !== false ? { date: { gte: new Date(iso(new Date())) } } : {}) }, orderBy: { date: "asc" }, take: 60 });
    },
  },
  {
    def: {
      name: "get_plan",
      description: "Séances planifiées sur une période (id, date, rôle dans le cycle 3+1, catégorie, durée, TSS prévu, statut, conformité) et phases de la saison.",
      input_schema: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, additionalProperties: false },
    },
    run: async (userId, input) => {
      const { from, to } = DateRange.parse(input ?? {});
      const f = from ?? iso(new Date());
      const t = to ?? iso(new Date(Date.now() + 14 * 86400_000));
      const [workouts, phases] = await Promise.all([
        prisma.plannedWorkout.findMany({ where: { userId, date: { gte: new Date(f), lte: new Date(t) } }, orderBy: { date: "asc" }, select: { id: true, date: true, dayRole: true, cycleIndex: true, title: true, category: true, durationMin: true, plannedTss: true, status: true, locked: true, compliance: true, priority: true } }),
        prisma.trainingPhase.findMany({ where: { userId, end: { gte: new Date(f) }, start: { lte: new Date(t) } } }),
      ]);
      return { workouts, phases, templates: TEMPLATES.map((x) => ({ id: x.id, title: x.title, category: x.category, intensity: x.intensity, minMin: x.minMin, maxMin: x.maxMin })) };
    },
  },
  {
    def: {
      name: "propose_plan_change",
      description: "Soumet une PROPOSITION de modification du plan (rien n'est appliqué sans validation de l'athlète). Les règles de cohérence (pas deux séances très dures consécutives, rien d'exigeant 2 jours avant une course) sont vérifiées ; une proposition qui les viole est refusée.",
      input_schema: {
        type: "object",
        properties: {
          title: { type: "string" },
          rationale: { type: "string", description: "Justification en français, en citant les données observées." },
          changes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                op: { type: "string", enum: ["move", "replace", "resize", "delete", "create"] },
                workoutId: { type: "string" },
                toDate: { type: "string" },
                date: { type: "string" },
                templateId: { type: "string" },
                durationMin: { type: "integer" },
              },
              required: ["op"],
            },
          },
        },
        required: ["title", "rationale", "changes"],
        additionalProperties: false,
      },
    },
    run: async (userId, input) => {
      const p = z.object({ title: z.string().min(3).max(200), rationale: z.string().min(10).max(4000), changes: z.array(ChangeSchema).min(1).max(20) }).parse(input);
      const check = await dryRun(userId, p.changes);
      if (!check.ok) return { accepted: false, issues: check.issues };
      const prop = await prisma.planProposal.create({ data: { userId, author: "coach-ia", title: p.title, rationale: p.rationale, evidence: {}, changes: p.changes as object } });
      return { accepted: true, proposalId: prop.id, summary: p.changes.map((c) => describeChange(c)), note: "Proposition en attente de validation par l'athlète." };
    },
  },
];

/** Vérifie les règles sans rien écrire. */
async function dryRun(userId: string, changes: z.infer<typeof ChangeSchema>[]) {
  const r = await checkChanges(userId, changes);
  return { ok: r.ok, issues: r.issues };
}

export async function runTool(userId: string, name: string, input: unknown): Promise<{ ok: boolean; result: unknown }> {
  const t = TOOLS.find((x) => x.def.name === name);
  if (!t) return { ok: false, result: `Outil inconnu : ${name}` };
  try {
    return { ok: true, result: await t.run(userId, input) };
  } catch (e) {
    return { ok: false, result: e instanceof z.ZodError ? `Paramètres invalides : ${e.issues.map((i) => i.message).join("; ")}` : e instanceof Error ? e.message : "Erreur" };
  }
}
