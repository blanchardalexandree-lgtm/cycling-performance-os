/**
 * Boucle d'adaptation : à chaque nouvelle activité.
 * 1. identifie la séance prévue du jour ; 2. compare prescription / exécution ;
 * 3. met à jour le statut ; 4. repère les écarts ; 5. PROPOSE (sans appliquer) des ajustements.
 */
import { prisma } from "../db";
import { evaluateCompliance } from "./compliance";
import { assessReadiness } from "./readiness";
import type { Change } from "./proposals";
import { iso } from "./cycle";

export function localDate(d: Date, tz = "Europe/Paris"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export async function matchActivityToPlan(userId: string, activityId: string) {
  const act = await prisma.activity.findUnique({ where: { id: activityId } });
  if (!act || act.userId !== userId) return;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  const day = localDate(act.startTime, user?.timezone);
  const planned = await prisma.plannedWorkout.findFirst({ where: { userId, date: new Date(day + "T00:00:00Z"), activityId: null } });

  // Course : rattacher le résultat à l'objectif du jour.
  const goal = await prisma.goal.findFirst({ where: { userId, kind: { not: "stage" }, date: { lte: new Date(day + "T00:00:00Z") }, OR: [{ endDate: { gte: new Date(day + "T00:00:00Z") } }, { date: new Date(day + "T00:00:00Z") }] } });
  if (goal && !act.isRace) {
    await prisma.activity.update({ where: { id: act.id }, data: { isRace: true } });
    await prisma.powerBest.updateMany({ where: { activityId: act.id }, data: { isRace: true } });
  }
  if (!planned) return;

  const c = evaluateCompliance(planned, act);
  await prisma.plannedWorkout.update({ where: { id: planned.id }, data: { activityId: act.id, status: c.status, compliance: c as object } });
  await proposeAdjustments(userId, day, { workoutTitle: planned.title, compliance: c, wasKey: planned.priority === 1, templateId: (planned.steps as { templateId?: string })?.templateId ?? null, durationMin: planned.durationMin });
}

async function proposeAdjustments(userId: string, day: string, ctx: { workoutTitle: string; compliance: ReturnType<typeof evaluateCompliance>; wasKey: boolean; templateId: string | null; durationMin: number }) {
  const next = await prisma.plannedWorkout.findMany({
    where: { userId, date: { gt: new Date(day + "T00:00:00Z") }, status: "PLANNED" },
    orderBy: { date: "asc" },
    take: 4,
  });
  if (!next.length) return;
  const changes: Change[] = [];
  const reasons: string[] = [];
  const { compliance } = ctx;

  // Surcharge marquée → alléger la prochaine séance exigeante (jamais compenser en surchargeant).
  if (compliance.tssRatio != null && compliance.tssRatio > 1.3) {
    const hard = next.find((w) => w.priority === 1 && w.dayRole === "TRAINING");
    if (hard && iso(hard.date) <= iso(new Date(new Date(day).getTime() + 2 * 86400_000))) {
      changes.push({ op: "resize", workoutId: hard.id, durationMin: Math.max(45, Math.round(hard.durationMin * 0.75)) });
      reasons.push(`Charge réalisée ${Math.round((compliance.tssRatio - 1) * 100)} % au-dessus du prévu : la prochaine séance clé est raccourcie pour limiter la fatigue résiduelle.`);
    }
  }
  // Séance clé incomplète → la reprogrammer à la place d'une séance complémentaire (pas en plus).
  if (ctx.wasKey && compliance.status === "PARTIAL") {
    const swap = next.find((w) => w.dayRole === "TRAINING" && w.priority >= 2);
    if (swap && ctx.templateId) {
      changes.push({ op: "replace", workoutId: swap.id, templateId: ctx.templateId, durationMin: Math.min(ctx.durationMin, Math.max(swap.durationMin, 60)) });
      reasons.push(`« ${ctx.workoutTitle} » n'a été que partiellement réalisée : proposition de la remplacer par la séance complémentaire du ${iso(swap.date)}, sans ajouter de charge.`);
    }
  }
  // État de forme
  const wellness = await prisma.wellnessEntry.findMany({ where: { userId, date: { lte: new Date(day + "T00:00:00Z") } }, orderBy: { date: "desc" }, take: 30 });
  const r = assessReadiness(wellness.map((w) => ({ ...w, date: iso(w.date) })));
  if (r.level === "red" || r.level === "stop") {
    const tomorrow = next[0];
    if (tomorrow && tomorrow.category !== "recuperation") {
      changes.push({ op: "replace", workoutId: tomorrow.id, templateId: "recup_active", durationMin: 30 });
      reasons.push(`État de forme « ${r.level === "stop" ? "arrêt" : "rouge"} » (${r.signals.map((s) => s.indicator).join(", ")}) : ${r.recommendation}`);
    }
  }
  if (!changes.length && !reasons.length) return;
  await prisma.planProposal.create({
    data: {
      userId,
      author: "adaptation-engine",
      title: `Ajustements suggérés après la séance du ${day}`,
      rationale: reasons.join("\n"),
      evidence: { compliance, readiness: { level: r.level, signals: r.signals } } as object,
      changes: changes as object,
    },
  });
}

/** Marque les séances passées sans activité comme manquées (n'impose rien, informe). */
export async function markMissed(userId: string, today: string) {
  await prisma.plannedWorkout.updateMany({
    where: { userId, status: "PLANNED", activityId: null, date: { lt: new Date(today + "T00:00:00Z") } },
    data: { status: "MISSED" },
  });
}
