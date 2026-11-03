import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { RunButton } from "@/components/client-actions";
import { deleteGoal, importRvc, saveGoal, saveGoalResult } from "../actions";
import { fmtDate, todayISO } from "@/lib/format";
import { diffDays, iso, phaseFor, PHASE_LABEL } from "@/lib/planning/cycle";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { course: "Course en ligne", clm: "Contre-la-montre", etapes: "Course à étapes", stage: "Stage d'entraînement", objectif: "Objectif de puissance" };

function GoalForm({ g }: { g?: Awaited<ReturnType<typeof prisma.goal.findFirst>> }) {
  return (
    <form action={saveGoal} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {g && <input type="hidden" name="id" value={g.id} />}
      <label className="sm:col-span-2"><span className="label">Épreuve</span><input name="name" required defaultValue={g?.name} className="input mt-1" /></label>
      <label><span className="label">Date</span><input name="date" type="date" required defaultValue={g ? iso(g.date) : ""} className="input mt-1" /></label>
      <label><span className="label">Fin (étapes)</span><input name="endDate" type="date" defaultValue={g?.endDate ? iso(g.endDate) : ""} className="input mt-1" /></label>
      <label><span className="label">Type</span><select name="kind" defaultValue={g?.kind ?? "course"} className="input mt-1">{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label><span className="label">Priorité</span><select name="priority" defaultValue={g?.priority ?? "C"} className="input mt-1"><option value="A">A — objectif majeur</option><option value="B">B — important</option><option value="C">C — préparation</option></select></label>
      <label><span className="label">Distance (km)</span><input name="distanceKm" type="number" step="0.1" defaultValue={g?.distanceKm ?? ""} className="input mt-1" /></label>
      <label><span className="label">Dénivelé (m)</span><input name="elevationM" type="number" defaultValue={g?.elevationM ?? ""} className="input mt-1" /></label>
      <label><span className="label">Type de parcours</span><input name="courseType" defaultValue={g?.courseType ?? ""} placeholder="plat, vallonné, technique…" className="input mt-1" /></label>
      <label><span className="label">Résultat recherché</span><input name="targetResult" defaultValue={g?.targetResult ?? ""} className="input mt-1" /></label>
      <label><span className="label">Qualités sollicitées</span><input name="demands" defaultValue={g?.demands.join(", ") ?? ""} placeholder="clm, seuil, répétition d'efforts" className="input mt-1" /></label>
      <label><span className="label">État de préparation</span><input name="readiness" defaultValue={g?.readiness ?? ""} className="input mt-1" /></label>
      <label className="sm:col-span-2"><span className="label">Déplacement / récupération</span><input name="logistics" defaultValue={g?.logistics ?? ""} className="input mt-1" /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirmed" defaultChecked={g?.confirmed ?? true} /> Date confirmée</label>
      <input type="hidden" name="discipline" value="Route" />
      <div className="flex items-end"><button className="btn-primary w-full">{g ? "Enregistrer" : "Ajouter"}</button></div>
    </form>
  );
}

export default async function Goals() {
  const user = await requireUser();
  const goals = await prisma.goal.findMany({ where: { userId: user.id }, orderBy: { date: "asc" } });
  const today = todayISO();
  const planGoals = goals.map((g) => ({ id: g.id, name: g.name, date: iso(g.date), endDate: g.endDate ? iso(g.endDate) : null, priority: g.priority, kind: g.kind, demands: g.demands }));
  const upcoming = goals.filter((g) => iso(g.endDate ?? g.date) >= today);
  const past = goals.filter((g) => iso(g.endDate ?? g.date) < today).reverse();
  const current = phaseFor(today, planGoals);
  return (
    <>
      <PageHeader
        title="Objectifs"
        subtitle={`Phase actuelle : ${PHASE_LABEL[current.phase]}${current.target ? ` (vers ${current.target.name})` : ""}. La périodisation se recalcule à chaque génération du plan.`}
        actions={<RunButton action={importRvc} label="Importer le calendrier RVC 2027" />}
      />
      <Card title="Nouvel objectif" className="mb-4"><GoalForm /></Card>
      <Card title={`À venir (${upcoming.length})`}>
        <div className="divide-y divide-line">
          {upcoming.map((g) => (
            <details key={g.id} className="group py-2.5">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3">
                <span className={`grid h-6 w-6 place-items-center rounded text-xs font-bold ${g.priority === "A" ? "bg-accent text-accent-ink" : g.priority === "B" ? "bg-ink-2 text-bg" : "bg-surface-2 text-ink-3"}`}>{g.priority}</span>
                <span className="font-medium">{g.name}</span>
                {!g.confirmed && <span className="chip border-warn/40 text-warn">à confirmer</span>}
                <span className="text-sm text-ink-3">{KIND[g.kind]}</span>
                <span className="ml-auto text-sm text-ink-3">{fmtDate(g.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}{g.endDate ? ` → ${fmtDate(g.endDate)}` : ""} · J−<span className="num">{diffDays(iso(g.date), today)}</span></span>
              </summary>
              <div className="mt-3 rounded-lg border border-line p-3">
                <GoalForm g={g} />
                <form action={deleteGoal.bind(null, g.id)} className="mt-2"><button className="text-xs text-bad hover:underline">Supprimer</button></form>
              </div>
            </details>
          ))}
          {!upcoming.length && <p className="py-2 text-sm text-ink-3">Aucun objectif à venir.</p>}
        </div>
      </Card>
      {past.length > 0 && (
        <Card title="Passés — résultats" className="mt-4">
          <div className="divide-y divide-line">
            {past.slice(0, 30).map((g) => (
              <form key={g.id} action={saveGoalResult} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <input type="hidden" name="id" value={g.id} />
                <span className="w-24 text-ink-3">{fmtDate(g.date)}</span>
                <span className="min-w-[160px] flex-1">{g.name}</span>
                <input name="resultRank" defaultValue={g.resultRank ?? ""} placeholder="Classement" className="input w-28 py-1" />
                <input name="resultNotes" defaultValue={g.resultNotes ?? ""} placeholder="Points forts, axes de progrès" className="input w-64 py-1" />
                <button className="btn-ghost px-2 py-1 text-xs">OK</button>
              </form>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
