"use server";
/**
 * Actions serveur. Chaque action : 1) authentifie, 2) valide strictement (zod),
 * 3) filtre par userId (isolation), 4) passe par les règles métier.
 */
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { destroySession, requireUser } from "@/lib/auth";
import { regeneratePlan } from "@/lib/planning/service";
import { applyChanges, ChangeSchema, type Change } from "@/lib/planning/proposals";
import { importRvcCalendar } from "@/lib/bootstrap";
import { METRIC_DEFS } from "@/lib/references";
import { saveGarminKey, testGarminKey } from "@/lib/integrations/garmin";
import { disconnectStrava, syncStrava } from "@/lib/integrations/strava";
import { askCoach, type CoachReply } from "@/lib/coach/coach";
import { addDays, iso } from "@/lib/planning/cycle";
import { fitCriticalPower } from "@/lib/physio/power";
import { rateLimit } from "@/lib/rate-limit";
import { recomputeLoad } from "@/lib/activities/recompute";

export type ActionResult = { ok: boolean; message?: string; issues?: string[] };

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optNum = z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().finite().optional());
const list = z.preprocess((v) => String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean), z.array(z.string().max(80)).max(20));

/* ---------- Profil ---------- */
const ProfileSchema = z.object({
  discipline: z.string().max(80), level: z.string().max(120), specialties: list, heightCm: optNum, birthYear: optNum,
  generalGoal: z.string().max(1000).optional(), constraints: z.string().max(2000).optional(), environment: list, equipment: list,
});
export async function saveProfile(form: FormData): Promise<void> {
  const u = await requireUser();
  const p = ProfileSchema.parse(Object.fromEntries(form));
  await prisma.athleteProfile.upsert({ where: { userId: u.id }, update: p, create: { userId: u.id, ...p } });
  revalidatePath("/profile");
}

const MetricSchema = z.object({
  key: z.string().refine((k) => k in METRIC_DEFS, "Métrique inconnue"),
  value: z.coerce.number().positive().max(5000),
  date: dateStr,
  origin: z.enum(["MEASURED", "ESTIMATED", "DECLARED"]),
  source: z.string().min(1).max(120),
  method: z.string().max(300).optional(),
  uncertainty: optNum,
  note: z.string().max(500).optional(),
});
export async function addMetric(form: FormData): Promise<void> {
  const u = await requireUser();
  const m = MetricSchema.parse(Object.fromEntries(form));
  await prisma.metricValue.create({ data: { ...m, userId: u.id, unit: METRIC_DEFS[m.key].unit, date: new Date(m.date + "T00:00:00Z") } });
  if (["FTP", "CP", "LTHR"].includes(m.key)) await recomputeLoad(u.id);
  revalidatePath("/profile");
  revalidatePath("/");
}
export async function deleteMetric(id: string): Promise<void> {
  const u = await requireUser();
  await prisma.metricValue.deleteMany({ where: { id, userId: u.id } });
  await recomputeLoad(u.id);
  revalidatePath("/profile");
}

/** Enregistre l'estimation CP/W′ issue des records (marquée ESTIMÉE, avec incertitude). */
export async function saveCpEstimate(): Promise<ActionResult> {
  const u = await requireUser();
  const since = new Date(Date.now() - 90 * 86400_000);
  const rows = await prisma.powerBest.findMany({ where: { userId: u.id, date: { gte: since } } });
  const best = new Map<number, number>();
  for (const r of rows) best.set(r.durationS, Math.max(best.get(r.durationS) ?? 0, r.watts));
  const fit = fitCriticalPower([...best.entries()].map(([durationS, watts]) => ({ durationS, watts })));
  if (!fit) return { ok: false, message: "Pas assez d'efforts maximaux entre 2 et 20 min sur 90 jours." };
  if (fit.r2 < 0.95) return { ok: false, message: `Ajustement trop faible (R² ${fit.r2.toFixed(2)}) : efforts probablement non maximaux. Un test est préférable.` };
  const date = new Date(iso(new Date()) + "T00:00:00Z");
  const method = `Modèle CP 2 paramètres (travail-temps), ${fit.points.length} durées 2-20 min, R² ${fit.r2.toFixed(3)}`;
  await prisma.metricValue.createMany({
    data: [
      { userId: u.id, key: "CP", value: Math.round(fit.cp), unit: "W", date, origin: "ESTIMATED", source: "Records 90 j", method, uncertainty: Math.round(fit.cpSe) },
      { userId: u.id, key: "W_PRIME", value: Math.round(fit.wPrime / 100) / 10, unit: "kJ", date, origin: "ESTIMATED", source: "Records 90 j", method, uncertainty: Math.round(fit.wPrimeSe / 100) / 10 },
    ],
  });
  await recomputeLoad(u.id);
  revalidatePath("/profile");
  revalidatePath("/performance");
  return { ok: true, message: `CP ≈ ${Math.round(fit.cp)} ± ${Math.round(fit.cpSe)} W enregistrée comme estimation.` };
}

/* ---------- Disponibilités & contraintes ---------- */
export async function saveAvailability(form: FormData): Promise<void> {
  const u = await requireUser();
  for (let d = 0; d < 7; d++) {
    const maxMinutes = z.coerce.number().int().min(0).max(600).parse(form.get(`min_${d}`) ?? 0);
    const outdoorOk = form.get(`out_${d}`) === "on";
    await prisma.weeklyAvailability.upsert({ where: { userId_weekday: { userId: u.id, weekday: d } }, update: { maxMinutes, outdoorOk }, create: { userId: u.id, weekday: d, maxMinutes, outdoorOk } });
  }
  revalidatePath("/profile");
}

const ConstraintSchema = z.object({
  kind: z.enum(["cours", "examen", "stage", "deplacement", "travail", "autre"]),
  title: z.string().min(1).max(120),
  start: dateStr, end: dateStr,
  maxTrainingMin: optNum,
  indoorOnly: z.preprocess((v) => v === "on", z.boolean()),
  noTraining: z.preprocess((v) => v === "on", z.boolean()),
});
export async function addConstraint(form: FormData): Promise<void> {
  const u = await requireUser();
  const c = ConstraintSchema.parse(Object.fromEntries(form));
  if (c.end < c.start) throw new Error("La fin précède le début.");
  await prisma.calendarConstraint.create({ data: { ...c, userId: u.id, start: new Date(c.start + "T00:00:00Z"), end: new Date(c.end + "T23:59:59Z") } });
  revalidatePath("/calendar");
  revalidatePath("/profile");
}
export async function deleteConstraint(id: string): Promise<void> {
  const u = await requireUser();
  await prisma.calendarConstraint.deleteMany({ where: { id, userId: u.id } });
  revalidatePath("/profile");
  revalidatePath("/calendar");
}

/* ---------- Objectifs ---------- */
const GoalSchema = z.object({
  name: z.string().min(1).max(160), date: dateStr, endDate: z.union([dateStr, z.literal("")]).optional(),
  kind: z.enum(["course", "clm", "etapes", "stage", "objectif"]), priority: z.enum(["A", "B", "C"]),
  discipline: z.string().max(60).default("Route"), distanceKm: optNum, elevationM: optNum,
  courseType: z.string().max(120).optional(), targetResult: z.string().max(300).optional(), demands: list,
  readiness: z.string().max(300).optional(), logistics: z.string().max(500).optional(),
  confirmed: z.preprocess((v) => v === "on", z.boolean()),
});
export async function saveGoal(form: FormData): Promise<void> {
  const u = await requireUser();
  const id = form.get("id")?.toString();
  const g = GoalSchema.parse(Object.fromEntries(form));
  const data = { ...g, date: new Date(g.date + "T00:00:00Z"), endDate: g.endDate ? new Date(g.endDate + "T00:00:00Z") : null };
  if (id) await prisma.goal.updateMany({ where: { id, userId: u.id }, data });
  else await prisma.goal.create({ data: { ...data, userId: u.id } });
  revalidatePath("/goals");
}
export async function deleteGoal(id: string): Promise<void> {
  const u = await requireUser();
  await prisma.goal.deleteMany({ where: { id, userId: u.id } });
  revalidatePath("/goals");
}
export async function saveGoalResult(form: FormData): Promise<void> {
  const u = await requireUser();
  const id = z.string().parse(form.get("id"));
  await prisma.goal.updateMany({ where: { id, userId: u.id }, data: { resultRank: String(form.get("resultRank") ?? "").slice(0, 60) || null, resultNotes: String(form.get("resultNotes") ?? "").slice(0, 2000) || null } });
  revalidatePath("/goals");
}
export async function importRvc(): Promise<ActionResult> {
  const u = await requireUser();
  const n = await importRvcCalendar(u.id);
  revalidatePath("/goals");
  return { ok: true, message: `${n} épreuve(s) ajoutée(s).` };
}

/* ---------- Plan ---------- */
export async function generatePlanAction(form: FormData): Promise<void> {
  const u = await requireUser();
  const weeks = z.coerce.number().int().min(1).max(52).parse(form.get("weeks") ?? 8);
  const start = iso(new Date());
  await regeneratePlan(u.id, start, addDays(start, weeks * 7 - 1));
  revalidatePath("/calendar");
  revalidatePath("/");
}

export async function setCycleAnchor(form: FormData): Promise<void> {
  const u = await requireUser();
  const d = dateStr.parse(form.get("anchor"));
  await prisma.userSettings.upsert({ where: { userId: u.id }, update: { cycleAnchorDate: new Date(d + "T00:00:00Z") }, create: { userId: u.id, cycleAnchorDate: new Date(d + "T00:00:00Z") } });
  revalidatePath("/calendar");
}

/** Modification manuelle par l'athlète (glisser-déposer, durée, remplacement…). */
export async function changeWorkouts(changes: Change[], force = false): Promise<ActionResult> {
  const u = await requireUser();
  const parsed = z.array(ChangeSchema).max(20).parse(changes);
  const r = await applyChanges(u.id, parsed, { force });
  if (r.ok) {
    // Une séance modifiée à la main n'est plus régénérée automatiquement.
    const ids = parsed.flatMap((c) => ("workoutId" in c && c.op !== "delete" ? [c.workoutId] : []));
    if (ids.length) await prisma.plannedWorkout.updateMany({ where: { userId: u.id, id: { in: ids } }, data: { generatedBy: "user" } });
    revalidatePath("/calendar");
    revalidatePath("/");
  }
  return { ok: r.ok, issues: r.issues };
}

export async function duplicateWorkout(id: string, toDate: string): Promise<ActionResult> {
  const u = await requireUser();
  const w = await prisma.plannedWorkout.findFirst({ where: { id, userId: u.id } });
  if (!w) return { ok: false, message: "Séance introuvable" };
  const { id: _id, createdAt: _c, updatedAt: _u, activityId: _a, compliance: _co, ...rest } = w;
  await prisma.plannedWorkout.create({ data: { ...rest, steps: rest.steps as object, date: new Date(dateStr.parse(toDate) + "T00:00:00Z"), status: "PLANNED", locked: false, generatedBy: "user" } });
  revalidatePath("/calendar");
  return { ok: true };
}

export async function toggleLock(id: string): Promise<void> {
  const u = await requireUser();
  const w = await prisma.plannedWorkout.findFirst({ where: { id, userId: u.id } });
  if (w) await prisma.plannedWorkout.update({ where: { id }, data: { locked: !w.locked } });
  revalidatePath("/calendar");
}

/* ---------- Propositions ---------- */
export async function decideProposal(id: string, accept: boolean, force = false): Promise<ActionResult> {
  const u = await requireUser();
  const p = await prisma.planProposal.findFirst({ where: { id, userId: u.id, status: "PENDING" } });
  if (!p) return { ok: false, message: "Proposition introuvable ou déjà traitée." };
  if (accept) {
    const changes = z.array(ChangeSchema).parse(p.changes);
    const r = await applyChanges(u.id, changes, { force });
    if (!r.ok) return { ok: false, issues: r.issues };
  }
  await prisma.planProposal.update({ where: { id }, data: { status: accept ? "ACCEPTED" : "REJECTED", decidedAt: new Date() } });
  revalidatePath("/");
  revalidatePath("/calendar");
  return { ok: true };
}

/* ---------- Récupération ---------- */
const Wellness = z.object({
  date: dateStr, sleepHours: optNum, sleepQuality: optNum, hrvMs: optNum, restingHr: optNum, fatigue: optNum, soreness: optNum,
  motivation: optNum, stress: optNum, weightKg: optNum, illness: z.preprocess((v) => v === "on", z.boolean()),
  pain: z.string().max(300).optional(), notes: z.string().max(1000).optional(),
});
export async function saveWellness(form: FormData): Promise<void> {
  const u = await requireUser();
  const w = Wellness.parse(Object.fromEntries(form));
  const date = new Date(w.date + "T00:00:00Z");
  const data = { ...w, date, pain: w.pain || null, notes: w.notes || null };
  await prisma.wellnessEntry.upsert({ where: { userId_date_source: { userId: u.id, date, source: "saisie" } }, update: data, create: { ...data, userId: u.id, source: "saisie" } });
  if (w.weightKg) {
    await prisma.metricValue.create({ data: { userId: u.id, key: "WEIGHT", value: w.weightKg, unit: "kg", date, origin: "MEASURED", source: "Pesée (saisie récupération)" } });
  }
  revalidatePath("/recovery");
  revalidatePath("/");
}

/* ---------- Activités ---------- */
export async function updateActivity(form: FormData): Promise<void> {
  const u = await requireUser();
  const id = z.string().parse(form.get("id"));
  const rpe = optNum.parse(form.get("rpe"));
  await prisma.activity.updateMany({
    where: { id, userId: u.id },
    data: { isRace: form.get("isRace") === "on", rpe: rpe ? Math.min(10, Math.max(1, Math.round(rpe))) : null, notes: String(form.get("notes") ?? "").slice(0, 2000) || null },
  });
  await prisma.powerBest.updateMany({ where: { activityId: id, userId: u.id }, data: { isRace: form.get("isRace") === "on" } });
  revalidatePath(`/activities/${id}`);
}
export async function deleteActivity(id: string): Promise<void> {
  const u = await requireUser();
  await prisma.activity.deleteMany({ where: { id, userId: u.id } });
  revalidatePath("/activities");
  redirect("/activities");
}

/* ---------- Intégrations ---------- */
export async function stravaSyncAction(): Promise<ActionResult> {
  const u = await requireUser();
  if (!rateLimit(`sync:${u.id}`, 6, 15 * 60_000)) return { ok: false, message: "Trop de synchronisations rapprochées." };
  const r = await syncStrava(u.id);
  revalidatePath("/integrations");
  return { ok: r.status !== "error", message: r.message ?? `${r.imported} importée(s), ${r.merged} fusionnée(s), ${r.skipped} ignorée(s).` };
}
export async function stravaDisconnectAction(): Promise<void> {
  const u = await requireUser();
  await disconnectStrava(u.id);
  revalidatePath("/integrations");
}
export async function garminKeyAction(form: FormData): Promise<ActionResult> {
  const u = await requireUser();
  const key = z.string().min(10).max(4000).parse(String(form.get("apiKey") ?? "").trim());
  await saveGarminKey(u.id, key);
  const r = await testGarminKey(u.id);
  revalidatePath("/integrations");
  return { ok: r.ok, message: r.message };
}
export async function garminDisconnect(): Promise<void> {
  const u = await requireUser();
  await prisma.integrationAccount.deleteMany({ where: { userId: u.id, provider: "garmin" } });
  revalidatePath("/integrations");
}

/* ---------- Coach ---------- */
export async function coachAsk(question: string): Promise<CoachReply | { error: string }> {
  const u = await requireUser();
  const q = z.string().trim().min(2).max(2000).safeParse(question);
  if (!q.success) return { error: "Question vide ou trop longue." };
  if (!rateLimit(`coach:${u.id}`, 20, 60 * 60_000)) return { error: "Limite de 20 questions par heure atteinte." };
  try {
    return await askCoach(u.id, q.data);
  } catch (e) {
    console.error("coach error", e instanceof Error ? e.message : "unknown");
    return { error: "Le coach n'a pas pu répondre (erreur API). Vérifie la clé et le modèle configurés." };
  }
}

/* ---------- Paramètres & compte ---------- */
export async function saveSettings(form: FormData): Promise<void> {
  const u = await requireUser();
  const preferredExport = z.enum(["zwo", "mrc", "fit"]).parse(form.get("preferredExport") ?? "zwo");
  await prisma.userSettings.upsert({ where: { userId: u.id }, update: { preferredExport }, create: { userId: u.id, preferredExport } });
  revalidatePath("/profile");
}

/** Suppression définitive du compte et de TOUTES ses données (cascade). */
export async function deleteAccount(form: FormData): Promise<void> {
  const u = await requireUser();
  if (form.get("confirm") !== "SUPPRIMER") throw new Error("Confirmation invalide");
  try { await disconnectStrava(u.id); } catch { /* révocation au mieux */ }
  await prisma.user.delete({ where: { id: u.id } });
  await destroySession();
  redirect("/register");
}
