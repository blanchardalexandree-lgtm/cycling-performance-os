import { prisma } from "../db";
import { generatePlan, iso, summarizePhases, PHASE_LABEL, type PlanGoal } from "./cycle";

const DEFAULT_WEEK = [90, 90, 90, 90, 90, 240, 240];

/**
 * (Re)génère le plan sur une période. Ne touche jamais :
 *  - aux séances verrouillées (validées), réalisées ou créées à la main / par le coach ;
 *  - au passé.
 */
export async function regeneratePlan(userId: string, start: string, end: string) {
  const today = iso(new Date());
  if (start < today) start = today;
  const [goals, constraints, avail, settings, keep, lastMeasured] = await Promise.all([
    prisma.goal.findMany({ where: { userId } }),
    prisma.calendarConstraint.findMany({ where: { userId, end: { gte: new Date(start) } } }),
    prisma.weeklyAvailability.findMany({ where: { userId } }),
    prisma.userSettings.findUnique({ where: { userId } }),
    prisma.plannedWorkout.findMany({
      where: { userId, date: { gte: new Date(start + "T00:00:00Z"), lte: new Date(end + "T00:00:00Z") }, OR: [{ locked: true }, { status: { not: "PLANNED" } }, { generatedBy: { not: "planner" } }] },
      select: { date: true },
    }),
    prisma.metricValue.findFirst({ where: { userId, key: { in: ["FTP", "CP"] }, origin: "MEASURED" }, orderBy: { date: "desc" } }),
  ]);
  const weekly = [...DEFAULT_WEEK];
  for (const a of avail) weekly[a.weekday] = a.maxMinutes;

  const planGoals: PlanGoal[] = goals.map((g) => ({ id: g.id, name: g.name, date: iso(g.date), endDate: g.endDate ? iso(g.endDate) : null, priority: g.priority, kind: g.kind, demands: g.demands }));
  const days = generatePlan({
    start, end,
    anchor: settings?.cycleAnchorDate ? iso(settings.cycleAnchorDate) : undefined,
    goals: planGoals,
    constraints: constraints.map((c) => ({ start: iso(c.start), end: iso(c.end), maxTrainingMin: c.maxTrainingMin, indoorOnly: c.indoorOnly, noTraining: c.noTraining, title: c.title })),
    weeklyMinutes: weekly,
    lockedDates: keep.map((k) => iso(k.date)),
    lastMeasuredRefDate: lastMeasured ? iso(lastMeasured.date) : null,
  });

  await prisma.$transaction(async (tx) => {
    await tx.plannedWorkout.deleteMany({
      where: { userId, date: { gte: new Date(start + "T00:00:00Z"), lte: new Date(end + "T00:00:00Z") }, locked: false, status: "PLANNED", generatedBy: "planner" },
    });
    const rows = days.filter((d) => d.workout && !(keep.some((k) => iso(k.date) === d.date))).map((d) => ({
      userId,
      date: new Date(d.date + "T00:00:00Z"),
      dayRole: d.role,
      cycleIndex: d.cycleIndex,
      title: d.workout!.title,
      category: d.workout!.category,
      objective: d.workout!.objective,
      rationale: [d.workout!.rationale, `Phase : ${PHASE_LABEL[d.phase]}${d.assimilation ? " (cycle d'assimilation)" : ""}.`, d.note].filter(Boolean).join(" "),
      priority: d.workout!.priority,
      durationMin: d.workout!.durationMin,
      plannedTss: d.workout!.plannedTss,
      steps: { templateId: d.workout!.templateId, blocks: d.workout!.blocks, successCriteria: d.workout!.successCriteria, adaptations: d.workout!.adaptations, technique: d.workout!.technique ?? null } as object,
      indoor: d.indoor,
      generatedBy: "planner",
    }));
    if (rows.length) await tx.plannedWorkout.createMany({ data: rows });
    await tx.trainingPhase.deleteMany({ where: { userId, start: { gte: new Date(start + "T00:00:00Z") } } });
    await tx.trainingPhase.createMany({
      data: summarizePhases(days).map((p) => ({ userId, name: PHASE_LABEL[p.phase], kind: p.phase, start: new Date(p.start + "T00:00:00Z"), end: new Date(p.end + "T00:00:00Z") })),
    });
  });
  return { days: days.length, created: days.filter((d) => d.workout).length };
}
