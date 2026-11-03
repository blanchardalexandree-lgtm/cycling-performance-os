import { z } from "zod";
import { prisma } from "../db";
import { buildWorkout } from "./library";
import { estimateTss, totalDurationS } from "./types";
import { iso, validateSequence, type DayRole } from "./cycle";

/** Opérations possibles sur le plan. Toute modification (moteur, coach IA) passe par ici. */
export const ChangeSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("move"), workoutId: z.string(), toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({ op: z.literal("replace"), workoutId: z.string(), templateId: z.string(), durationMin: z.number().int().min(15).max(420) }),
  z.object({ op: z.literal("resize"), workoutId: z.string(), durationMin: z.number().int().min(15).max(420) }),
  z.object({ op: z.literal("delete"), workoutId: z.string() }),
  z.object({ op: z.literal("create"), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), templateId: z.string(), durationMin: z.number().int().min(15).max(420) }),
]);
export type Change = z.infer<typeof ChangeSchema>;

const INTENSITY: Record<string, "low" | "moderate" | "high"> = {
  recuperation: "low", endurance: "low", cadence: "low", tempo: "moderate", sweetspot: "moderate", force: "moderate", sprint: "moderate", activation: "moderate",
  seuil: "high", vo2: "high", anaerobie: "high", repetition: "high", clm: "high", test: "high",
};
export const intensityOf = (category: string) => INTENSITY[category] ?? "moderate";

export function describeChange(c: Change, titles: Record<string, string> = {}): string {
  switch (c.op) {
    case "move": return `Déplacer « ${titles[c.workoutId] ?? c.workoutId} » au ${c.toDate}`;
    case "replace": return `Remplacer « ${titles[c.workoutId] ?? c.workoutId} » par ${c.templateId} (${c.durationMin} min)`;
    case "resize": return `Ramener « ${titles[c.workoutId] ?? c.workoutId} » à ${c.durationMin} min`;
    case "delete": return `Supprimer « ${titles[c.workoutId] ?? c.workoutId} »`;
    case "create": return `Ajouter ${c.templateId} (${c.durationMin} min) le ${c.date}`;
  }
}

/**
 * Simule les changements, vérifie les règles de cohérence sur ±7 jours, puis applique en transaction.
 * Renvoie les avertissements ; refuse si une séance n'appartient pas à l'utilisateur.
 */
export async function checkChanges(userId: string, changes: Change[]): Promise<{ ok: boolean; issues: string[]; owned: Awaited<ReturnType<typeof prisma.plannedWorkout.findMany>> }> {
  const ids = changes.flatMap((c) => ("workoutId" in c ? [c.workoutId] : []));
  const owned = await prisma.plannedWorkout.findMany({ where: { userId, id: { in: ids } } });
  if (owned.length !== new Set(ids).size) return { ok: false, issues: ["Séance introuvable ou non autorisée."], owned };
  if (!changes.length) return { ok: true, issues: [], owned };

  const dates = [...owned.map((w) => iso(w.date)), ...changes.flatMap((c) => (c.op === "move" ? [c.toDate] : c.op === "create" ? [c.date] : []))].sort();
  const from = new Date(new Date(dates[0] + "T00:00:00Z").getTime() - 7 * 86400_000);
  const to = new Date(new Date(dates[dates.length - 1] + "T00:00:00Z").getTime() + 7 * 86400_000);
  const window = await prisma.plannedWorkout.findMany({ where: { userId, date: { gte: from, lte: to } } });
  const races = await prisma.goal.findMany({ where: { userId, kind: { not: "stage" }, date: { gte: from, lte: to } } });

  // Simulation
  type Sim = { id: string; date: string; role: DayRole; intensity: string | null; deleted?: boolean };
  const sim = new Map<string, Sim>(window.map((w) => [w.id, { id: w.id, date: iso(w.date), role: w.dayRole as DayRole, intensity: intensityOf(w.category) }]));
  let n = 0;
  for (const c of changes) {
    if (c.op === "move") sim.get(c.workoutId)!.date = c.toDate;
    if (c.op === "delete") sim.get(c.workoutId)!.deleted = true;
    if (c.op === "replace") {
      const w = buildWorkout(c.templateId, c.durationMin);
      if (!w) return { ok: false, issues: [`Modèle « ${c.templateId} » inconnu ou incompatible avec ${c.durationMin} min.`], owned };
      const s = sim.get(c.workoutId)!;
      s.intensity = w.intensity;
      s.role = c.templateId === "recup_active" ? "ACTIVE_RECOVERY" : s.role === "ACTIVE_RECOVERY" ? "TRAINING" : s.role;
    }
    if (c.op === "create") {
      const w = buildWorkout(c.templateId, c.durationMin);
      if (!w) return { ok: false, issues: [`Modèle « ${c.templateId} » inconnu ou incompatible.`], owned };
      sim.set(`new${n++}`, { id: "new", date: c.date, role: c.templateId === "recup_active" ? "ACTIVE_RECOVERY" : "TRAINING", intensity: w.intensity });
    }
  }
  const issues = validateSequence([...sim.values()].filter((s) => !s.deleted), races.map((r) => iso(r.date)));
  return { ok: issues.length === 0, issues, owned };
}

/** Vérifie (checkChanges) puis applique en transaction. `force` : l'athlète accepte malgré les avertissements. */
export async function applyChanges(userId: string, changes: Change[], opts: { force?: boolean } = {}): Promise<{ ok: boolean; issues: string[] }> {
  const { ok, issues, owned } = await checkChanges(userId, changes);
  if (!ok && (!opts.force || issues.some((i) => i.includes("non autorisée") || i.includes("inconnu")))) return { ok: false, issues };

  await prisma.$transaction(async (tx) => {
    for (const c of changes) {
      if (c.op === "move") await tx.plannedWorkout.update({ where: { id: c.workoutId }, data: { date: new Date(c.toDate + "T00:00:00Z"), cycleIndex: null } });
      if (c.op === "delete") await tx.plannedWorkout.delete({ where: { id: c.workoutId } });
      if (c.op === "resize" || c.op === "replace") {
        const cur = owned.find((w) => w.id === c.workoutId)!;
        const templateId = c.op === "replace" ? c.templateId : ((cur.steps as { templateId?: string })?.templateId ?? "endurance");
        const w = buildWorkout(templateId, c.durationMin);
        if (!w) continue;
        await tx.plannedWorkout.update({
          where: { id: c.workoutId },
          data: {
            title: w.title, category: w.category, objective: w.objective, rationale: w.rationale, priority: w.priority,
            steps: { templateId: w.templateId, blocks: w.blocks, successCriteria: w.successCriteria, adaptations: w.adaptations, technique: w.technique ?? null } as object,
            durationMin: Math.round(totalDurationS(w.blocks) / 60), plannedTss: estimateTss(w.blocks),
            dayRole: templateId === "recup_active" ? "ACTIVE_RECOVERY" : cur.dayRole === "ACTIVE_RECOVERY" ? "TRAINING" : cur.dayRole,
          },
        });
      }
      if (c.op === "create") {
        const w = buildWorkout(c.templateId, c.durationMin)!;
        await tx.plannedWorkout.create({
          data: {
            userId, date: new Date(c.date + "T00:00:00Z"), dayRole: c.templateId === "recup_active" ? "ACTIVE_RECOVERY" : "TRAINING",
            title: w.title, category: w.category, objective: w.objective, rationale: w.rationale, priority: w.priority,
            steps: { templateId: w.templateId, blocks: w.blocks, successCriteria: w.successCriteria, adaptations: w.adaptations, technique: w.technique ?? null } as object,
            durationMin: Math.round(totalDurationS(w.blocks) / 60), plannedTss: estimateTss(w.blocks), generatedBy: "user",
          },
        });
      }
    }
  });
  return { ok: true, issues };
}
