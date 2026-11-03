import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, Dot, Notice, PageHeader } from "@/components/ui";
import { WorkoutProfile } from "@/components/workout-profile";
import { resolveBlocks, formatDuration, type ResolvedStep } from "@/lib/planning/resolve";
import { getReferences, powerReference } from "@/lib/references";
import { catStyle, fmtDay, fmtNum } from "@/lib/format";
import type { Block } from "@/lib/planning/types";
import type { Compliance } from "@/lib/planning/compliance";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { warmup: "Échauffement", steady: "Continu", interval: "Effort", recovery: "Récupération", cooldown: "Retour au calme", sprint: "Sprint" };

function StepRow({ s, refWatts }: { s: ResolvedStep; refWatts: number | null }) {
  return (
    <tr>
      <td className="whitespace-nowrap">{KIND[s.kind]}{s.label && s.label !== KIND[s.kind] ? <span className="text-ink-3"> · {s.label}</span> : null}</td>
      <td className="num">{formatDuration(s.durationS)}</td>
      <td className="num">{s.kind === "sprint" ? "max" : `${Math.round(s.low * 100)}–${Math.round(s.high * 100)} %`}</td>
      <td className="num">{s.wattsLow != null ? `${s.wattsLow}–${s.wattsHigh} W` : refWatts ? "max" : <span className="text-ink-3">RPE {s.rpe}</span>}</td>
      <td className="text-ink-3">{s.hrHint}</td>
      <td className="num text-ink-3">{s.cadence ? `${s.cadence[0]}–${s.cadence[1]}` : "libre"}</td>
    </tr>
  );
}

export default async function WorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const w = await prisma.plannedWorkout.findFirst({ where: { id, userId: user.id }, include: { activity: true } });
  if (!w) notFound();
  const refs = await getReferences(user.id);
  const pref = powerReference(refs);
  const steps = w.steps as unknown as { templateId: string; blocks: Block[]; successCriteria: string[]; adaptations: string[]; technique: string | null };
  const resolved = resolveBlocks(steps.blocks, pref?.watts ?? null);
  const comp = w.compliance as Compliance | null;
  const c = catStyle(w.category);
  return (
    <>
      <PageHeader
        title={w.title}
        subtitle={<span className="flex items-center gap-2"><Dot color={c.color} />{c.label} · {fmtDay(w.date)} · {w.durationMin} min · TSS prévu {fmtNum(w.plannedTss)} · priorité {w.priority === 1 ? "clé" : w.priority === 2 ? "normale" : "optionnelle"}</span>}
        actions={<>
          <a className="btn-ghost" href={`/api/workouts/${w.id}/export?format=zwo`}>Export .zwo (Zwift)</a>
          <a className="btn-ghost" href={`/api/workouts/${w.id}/export?format=mrc`}>Export .mrc</a>
          <a className="btn-ghost" href={`/api/workouts/${w.id}/export?format=fit`}>Export .fit (Garmin)</a>
        </>}
      />
      {!pref && <div className="mb-4"><Notice tone="warn">Aucune référence de puissance fiable : la séance est prescrite en % et au ressenti (RPE). Les watts apparaîtront dès qu'une FTP mesurée/déclarée ou une CP estimée sera enregistrée.</Notice></div>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Structure" className="lg:col-span-2">
          <WorkoutProfile blocks={steps.blocks} refWatts={pref?.watts ?? null} height={80} />
          <div className="mt-4 overflow-x-auto">
            <table className="table min-w-[640px]">
              <thead><tr><th>Étape</th><th>Durée</th><th>% réf.</th><th>Cible</th><th>FC</th><th>Cadence</th></tr></thead>
              <tbody>
                {resolved.map((b, i) => "steps" in b ? (
                  <tr key={i}><td colSpan={6} className="!p-0">
                    <div className="border-l-2 border-accent/50 pl-2">
                      <div className="label py-1.5 text-accent">{b.count} ×</div>
                      <table className="w-full"><tbody>{b.steps.map((s, j) => <StepRow key={j} s={s} refWatts={pref?.watts ?? null} />)}</tbody></table>
                    </div>
                  </td></tr>
                ) : <StepRow key={i} s={b} refWatts={pref?.watts ?? null} />)}
              </tbody>
            </table>
          </div>
          {pref && <p className="mt-2 text-xs text-ink-3">Watts calculés à partir de : {pref.label} {Math.round(pref.watts)} W.</p>}
        </Card>
        <div className="flex flex-col gap-4">
          <Card title="Objectif et justification">
            <p className="text-sm">{w.objective}</p>
            <p className="mt-2 text-sm text-ink-2">{w.rationale}</p>
            {steps.technique && <p className="mt-2 text-sm text-ink-2"><span className="label">Consignes</span><br />{steps.technique}</p>}
          </Card>
          <Card title="Critères de réussite"><ul className="list-disc space-y-1 pl-4 text-sm text-ink-2">{steps.successCriteria.map((s) => <li key={s}>{s}</li>)}</ul></Card>
          <Card title="Adaptations possibles"><ul className="list-disc space-y-1 pl-4 text-sm text-ink-2">{steps.adaptations.map((s) => <li key={s}>{s}</li>)}</ul></Card>
          <Card title="Exécution">
            {w.activity ? (
              <div className="text-sm">
                <Link className="text-accent" href={`/activities/${w.activity.id}`}>{w.activity.name}</Link>
                {comp && <div className="mt-1 text-ink-2">Score de conformité <span className="num">{comp.score}</span>/100 · durée {comp.durationRatio != null ? Math.round(comp.durationRatio * 100) : "—"} % · charge {comp.tssRatio != null ? Math.round(comp.tssRatio * 100) : "—"} %</div>}
                {comp?.notes.map((n) => <div key={n} className="text-xs text-ink-3">{n}</div>)}
              </div>
            ) : <p className="text-sm text-ink-3">Pas encore réalisée. L'activité du jour sera rapprochée automatiquement à l'import.</p>}
          </Card>
          <Card title="Formats d'export">
            <ul className="space-y-1 text-xs text-ink-3">
              <li><b className="text-ink-2">.zwo</b> : Zwift (Documents/Zwift/Workouts/&lt;id&gt;), intensités en % de la FTP réglée dans Zwift.</li>
              <li><b className="text-ink-2">.mrc</b> : TrainerRoad, Golden Cheetah et logiciels de home trainer compatibles « minutes/percent ».</li>
              <li><b className="text-ink-2">.fit</b> : séance Garmin Edge (copier dans GARMIN/NewFiles par USB). Cibles en watts absolus si une référence existe.</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
