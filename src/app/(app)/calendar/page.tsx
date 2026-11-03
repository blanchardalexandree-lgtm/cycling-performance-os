import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { CalendarBoard, type CalItem } from "./board";
import { SeasonTimeline } from "./season";
import { generatePlanAction, setCycleAnchor } from "../actions";
import { addDays, iso, phaseFor, PHASE_LABEL, diffDays } from "@/lib/planning/cycle";
import { todayISO } from "@/lib/format";
import { getReferences, powerReference } from "@/lib/references";

export const dynamic = "force-dynamic";

type View = "day" | "week" | "month" | "season";

function range(view: View, anchor: string): [string, string] {
  const d = new Date(anchor + "T00:00:00Z");
  if (view === "day") return [anchor, anchor];
  if (view === "week") {
    const wd = (d.getUTCDay() + 6) % 7;
    const s = addDays(anchor, -wd);
    return [s, addDays(s, 6)];
  }
  if (view === "month") {
    const first = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
    const wd = (new Date(first + "T00:00:00Z").getUTCDay() + 6) % 7;
    const s = addDays(first, -wd);
    return [s, addDays(s, 41)];
  }
  return [addDays(anchor, -30), addDays(anchor, 365)];
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const view = (["day", "week", "month", "season"].includes(sp.view ?? "") ? sp.view : "month") as View;
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : todayISO();
  const [from, to] = range(view, anchor);
  const F = new Date(from + "T00:00:00Z"), T = new Date(to + "T23:59:59Z");
  const [workouts, goals, constraints, phases, activities, proposals, settings, refs] = await Promise.all([
    prisma.plannedWorkout.findMany({ where: { userId: user.id, date: { gte: F, lte: T } }, orderBy: [{ date: "asc" }, { priority: "asc" }] }),
    prisma.goal.findMany({ where: { userId: user.id, date: { lte: T }, OR: [{ endDate: { gte: F } }, { date: { gte: F } }] } }),
    prisma.calendarConstraint.findMany({ where: { userId: user.id, start: { lte: T }, end: { gte: F } } }),
    prisma.trainingPhase.findMany({ where: { userId: user.id, start: { lte: T }, end: { gte: F } }, orderBy: { start: "asc" } }),
    prisma.activity.findMany({ where: { userId: user.id, startTime: { gte: F, lte: T } }, select: { id: true, name: true, startTime: true, durationS: true, tss: true, isRace: true } }),
    prisma.planProposal.findMany({ where: { userId: user.id, status: "PENDING" }, select: { changes: true, title: true } }),
    prisma.userSettings.findUnique({ where: { userId: user.id } }),
    getReferences(user.id),
  ]);
  const pendingIds = new Set(proposals.flatMap((p) => (p.changes as { workoutId?: string }[]).map((c) => c.workoutId).filter(Boolean) as string[]));
  const items: CalItem[] = [
    ...workouts.map((w) => ({
      kind: "workout" as const, id: w.id, date: iso(w.date), title: w.title, category: w.category, durationMin: w.durationMin, tss: w.plannedTss,
      role: w.dayRole, cycleIndex: w.cycleIndex, status: w.status, locked: w.locked, priority: w.priority, pending: pendingIds.has(w.id),
      steps: w.steps as object, actualActivityId: w.activityId,
    })),
    ...goals.flatMap((g) => {
      const out: CalItem[] = [];
      const end = g.endDate ? iso(g.endDate) : iso(g.date);
      for (let d = iso(g.date); d <= end; d = addDays(d, 1)) out.push({ kind: "goal", id: g.id, date: d, title: g.name, priority: g.priority, goalKind: g.kind, confirmed: g.confirmed });
      return out;
    }),
    ...constraints.flatMap((c) => {
      const out: CalItem[] = [];
      for (let d = iso(c.start); d <= iso(c.end); d = addDays(d, 1)) out.push({ kind: "constraint", id: c.id, date: d, title: c.title, maxMin: c.maxTrainingMin, noTraining: c.noTraining });
      return out;
    }),
    ...activities.map((a) => ({ kind: "activity" as const, id: a.id, date: iso(a.startTime), title: a.name, durationMin: Math.round(a.durationS / 60), tss: a.tss, isRace: a.isRace })),
  ];
  const pref = powerReference(refs);
  // Saison : périodisation projetée à partir des objectifs (même logique que le planificateur).
  const projected: { kind: string; name: string; start: string; end: string }[] = [];
  if (view === "season") {
    const allGoals = await prisma.goal.findMany({ where: { userId: user.id } });
    const pg = allGoals.map((g) => ({ id: g.id, name: g.name, date: iso(g.date), endDate: g.endDate ? iso(g.endDate) : null, priority: g.priority, kind: g.kind, demands: g.demands }));
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const ph = phaseFor(d, pg).phase;
      const last = projected[projected.length - 1];
      if (last && last.kind === ph && diffDays(d, last.end) === 1) last.end = d;
      else projected.push({ kind: ph, name: PHASE_LABEL[ph], start: d, end: d });
    }
  }
  const views: [View, string][] = [["day", "Jour"], ["week", "Semaine"], ["month", "Mois"], ["season", "Saison"]];
  const step = view === "day" ? 1 : view === "week" ? 7 : view === "month" ? 30 : 90;
  const monthLabel = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(anchor + "T00:00:00Z"));

  return (
    <>
      <PageHeader
        title="Calendrier"
        subtitle="Cycle de référence : 3 jours d'entraînement + 1 jour de récupération active. Glisse une séance pour la déplacer ; les règles de cohérence sont vérifiées."
        actions={
          <form action={generatePlanAction} className="flex items-center gap-2">
            <select name="weeks" defaultValue="8" className="input w-auto py-1.5" aria-label="Horizon">
              {[4, 8, 12, 26, 40].map((w) => <option key={w} value={w}>{w} semaines</option>)}
            </select>
            <button className="btn-primary">Générer / mettre à jour le plan</button>
          </form>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-line p-0.5">
          {views.map(([v, l]) => (
            <Link key={v} href={`/calendar?view=${v}&date=${anchor}`} className={`rounded-md px-3 py-1 text-sm ${v === view ? "bg-surface-2 text-ink" : "text-ink-3 hover:text-ink"}`}>{l}</Link>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Link aria-label="Précédent" className="btn-ghost px-2.5 py-1" href={`/calendar?view=${view}&date=${addDays(anchor, -step)}`}>‹</Link>
          <Link className="btn-ghost px-3 py-1" href={`/calendar?view=${view}`}>Aujourd'hui</Link>
          <Link aria-label="Suivant" className="btn-ghost px-2.5 py-1" href={`/calendar?view=${view}&date=${addDays(anchor, step)}`}>›</Link>
        </div>
        <span className="text-sm font-medium capitalize text-ink-2">{view === "month" ? monthLabel : `${from} → ${to}`}</span>
        <form action={setCycleAnchor} className="ml-auto flex items-center gap-2 text-xs text-ink-3">
          <label htmlFor="anchor">Jour 1 du cycle</label>
          <input id="anchor" name="anchor" type="date" defaultValue={settings?.cycleAnchorDate ? iso(settings.cycleAnchorDate) : ""} className="input w-auto py-1 text-xs" />
          <button className="btn-ghost px-2 py-1 text-xs">Caler</button>
        </form>
      </div>
      {view === "season" ? (
        <SeasonTimeline from={from} to={to} phases={projected} items={items} />
      ) : (
        <CalendarBoard view={view} from={from} to={to} anchorMonth={anchor.slice(0, 7)} items={items} today={todayISO()} refWatts={pref?.watts ?? null} phases={phases.map((p) => ({ kind: p.kind, name: p.name, start: iso(p.start), end: iso(p.end) }))} />
      )}
    </>
  );
}
