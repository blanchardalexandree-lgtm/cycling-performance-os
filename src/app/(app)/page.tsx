import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getReferences, powerReference } from "@/lib/references";
import { loadSummary, readinessToday } from "@/lib/coach/tools";
import { markMissed } from "@/lib/planning/adaptation";
import { Card, Notice, PageHeader, Stat, StatusPill, OriginBadge } from "@/components/ui";
import { WorkoutCard } from "@/components/workout-card";
import { PmcChart } from "@/components/charts";
import { ProposalActions } from "@/components/client-actions";
import { fmtDate, fmtDuration, fmtNum, todayISO } from "@/lib/format";
import { addDays, diffDays } from "@/lib/planning/cycle";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await requireUser();
  const today = todayISO();
  await markMissed(user.id, today);
  const d = (s: string) => new Date(s + "T00:00:00Z");
  const [refs, todayW, tomorrowW, nextGoals, integrations, proposals, acts7, acts28, planned7, load, readiness, lastActivity] = await Promise.all([
    getReferences(user.id),
    prisma.plannedWorkout.findFirst({ where: { userId: user.id, date: d(today) }, orderBy: { priority: "asc" } }),
    prisma.plannedWorkout.findFirst({ where: { userId: user.id, date: d(addDays(today, 1)) }, orderBy: { priority: "asc" } }),
    prisma.goal.findMany({ where: { userId: user.id, kind: { not: "stage" }, date: { gte: d(today) } }, orderBy: { date: "asc" }, take: 20 }),
    prisma.integrationAccount.findMany({ where: { userId: user.id } }),
    prisma.planProposal.findMany({ where: { userId: user.id, status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 3 }),
    prisma.activity.findMany({ where: { userId: user.id, startTime: { gte: d(addDays(today, -6)) } }, select: { durationS: true, distanceM: true, elevationGainM: true, tss: true } }),
    prisma.activity.aggregate({ where: { userId: user.id, startTime: { gte: d(addDays(today, -27)) } }, _sum: { durationS: true } }),
    prisma.plannedWorkout.findMany({ where: { userId: user.id, date: { gte: d(addDays(today, -6)), lte: d(today) } }, select: { plannedTss: true, durationMin: true } }),
    loadSummary(user.id, 90),
    readinessToday(user.id),
    prisma.activity.findFirst({ where: { userId: user.id }, orderBy: { startTime: "desc" }, select: { startTime: true, name: true, id: true } }),
  ]);
  const pref = powerReference(refs);
  const nextA = nextGoals.find((g) => g.priority === "A");
  const next = nextGoals[0];
  const vol7 = acts7.reduce((s, a) => s + a.durationS, 0);
  const tss7 = acts7.reduce((s, a) => s + (a.tss ?? 0), 0);
  const plannedTss7 = planned7.reduce((s, w) => s + (w.plannedTss ?? 0), 0);
  const strava = integrations.find((i) => i.provider === "strava");
  const wkg = pref && refs.weight ? pref.watts / refs.weight.value : null;

  const alerts: { tone: "info" | "warn" | "bad"; text: React.ReactNode }[] = [];
  if (!pref) alerts.push({ tone: "warn", text: <>Aucune référence de puissance (FTP ou CP) : les séances sont prescrites au ressenti et en % uniquement. <Link className="text-accent" href="/profile">Renseigner une FTP mesurée</Link> ou réaliser le test proposé.</> });
  if (pref?.origin === "ESTIMATED") alerts.push({ tone: "info", text: `Les cibles en watts reposent sur une ${pref.label} : à confirmer par un test.` });
  if (!refs.weight) alerts.push({ tone: "info", text: <>Poids non renseigné : rapport puissance/poids indisponible. <Link className="text-accent" href="/recovery">Ajouter une pesée</Link></> });
  for (const i of integrations) if (i.lastError) alerts.push({ tone: "bad", text: `${i.provider === "strava" ? "Strava" : "Garmin"} : ${i.lastError}` });
  if (load.activitiesWithoutLoad > 0) alerts.push({ tone: "info", text: `${load.activitiesWithoutLoad} activité(s) récente(s) sans charge calculable (pas de puissance ni de seuil FC) : la CTL est sous-estimée.` });

  const topReco = readiness.level !== "green"
    ? readiness.recommendation
    : proposals.length ? `${proposals.length} ajustement(s) du plan en attente de ta validation.`
    : todayW ? `Séance du jour maintenue : ${todayW.title}. ${todayW.objective}`
    : "Aucune séance aujourd'hui : génère ou complète ton plan.";

  return (
    <>
      <PageHeader
        title={`Bonjour ${user.name}`}
        subtitle={new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}
        actions={<><Link href="/activities" className="btn-ghost">Importer une activité</Link><Link href="/coach" className="btn-primary">Demander au coach</Link></>}
      />

      <section className="card card-pad mb-4 border-accent/30">
        <div className="flex flex-wrap items-center gap-3">
          <span className="label text-accent">Recommandation prioritaire</span>
          <StatusPill level={readiness.level} />
        </div>
        <p className="mt-2 text-[15px] leading-relaxed">{topReco}</p>
        {readiness.signals.length > 0 && <p className="mt-1 text-xs text-ink-3">Signaux : {readiness.signals.map((s) => `${s.indicator} ${s.observed}${s.baseline ? ` (réf. ${s.baseline})` : ""}`).join(" · ")}</p>}
        {readiness.dataCoverage.length === 0 && <p className="mt-1 text-xs text-ink-3">Aucune donnée de récupération : <Link href="/recovery" className="text-accent">saisir sommeil, fatigue, HRV</Link>.</p>}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <WorkoutCard w={todayW} label="Aujourd'hui" refWatts={pref?.watts ?? null} />
        <WorkoutCard w={tomorrowW} label="Demain" refWatts={pref?.watts ?? null} />
        <Card title="Prochain objectif">
          {next ? (
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-semibold">{next.name}</span>
                <span className="chip">{next.priority}</span>
              </div>
              <div className="mt-1 text-sm text-ink-3">{fmtDate(next.date, { weekday: "long", day: "numeric", month: "long" })} · J−<span className="num">{diffDays(next.date.toISOString().slice(0, 10), today)}</span></div>
              {nextA && nextA.id !== next.id && (
                <div className="mt-3 border-t border-line pt-3 text-sm">
                  <span className="label">Objectif A</span>
                  <div className="mt-1 flex justify-between"><span className="truncate">{nextA.name}</span><span className="num text-ink-2">J−{diffDays(nextA.date.toISOString().slice(0, 10), today)}</span></div>
                </div>
              )}
            </div>
          ) : <p className="text-sm text-ink-3">Aucun objectif. <Link className="text-accent" href="/goals">Ajouter des courses</Link></p>}
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="card card-pad"><Stat label={pref?.label ?? "Référence"} value={pref ? Math.round(pref.watts) : "—"} unit={pref ? "W" : undefined} origin={pref?.origin} /></div>
        <div className="card card-pad"><Stat label="W/kg" value={wkg ? wkg.toFixed(2) : "—"} hint={refs.weight ? `${refs.weight.value} kg` : "poids manquant"} /></div>
        <div className="card card-pad"><Stat label="CTL" value={fmtNum(load.ctl)} hint={load.ramp != null ? `${load.ramp >= 0 ? "+" : ""}${load.ramp} sur 7 j` : undefined} /></div>
        <div className="card card-pad"><Stat label="TSB" value={fmtNum(load.tsb)} hint="fraîcheur (veille)" /></div>
        <div className="card card-pad"><Stat label="Volume 7 j" value={fmtDuration(vol7)} hint={`28 j : ${fmtDuration(acts28._sum.durationS ?? 0)}`} /></div>
        <div className="card card-pad"><Stat label="Charge 7 j" value={Math.round(tss7)} hint={`prévu ${Math.round(plannedTss7)}`} /></div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Charge d'entraînement — 90 jours" className="lg:col-span-2" action={<Link href="/performance" className="text-xs text-ink-3 hover:text-ink">Détails</Link>}>
          {load.series.some((p) => p.tss > 0) ? <PmcChart data={load.series} /> : <p className="text-sm text-ink-3">Pas encore d'activité avec charge calculable. Importe tes fichiers .fit ou connecte Strava.</p>}
        </Card>
        <div className="flex flex-col gap-4">
          <Card title="Synchronisation" action={<Link href="/integrations" className="text-xs text-ink-3 hover:text-ink">Gérer</Link>}>
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between"><span>Strava</span><span className="text-ink-3">{strava?.status === "connected" ? (strava.lastSyncAt ? `sync ${fmtDate(strava.lastSyncAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "connecté") : "non connecté"}</span></li>
              <li className="flex justify-between"><span>Garmin</span><span className="text-ink-3">{integrations.find((i) => i.provider === "garmin")?.status === "connected" ? "clé valide" : "import .fit"}</span></li>
              <li className="flex justify-between"><span>Nolio</span><span className="text-ink-3">abonnement requis</span></li>
              <li className="flex justify-between border-t border-line pt-2"><span>Dernière activité</span><span className="text-ink-3">{lastActivity ? fmtDate(lastActivity.startTime) : "—"}</span></li>
            </ul>
          </Card>
          {alerts.length > 0 && (
            <Card title="Alertes">
              <div className="space-y-2">{alerts.slice(0, 4).map((a, i) => <Notice key={i} tone={a.tone}>{a.text}</Notice>)}</div>
            </Card>
          )}
        </div>
      </div>

      {proposals.length > 0 && (
        <Card title="Modifications proposées — en attente de validation" className="mt-4">
          <div className="divide-y divide-line">
            {proposals.map((p) => (
              <div key={p.id} className="py-3 first:pt-0">
                <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{p.title}</span><span className="chip">{p.author === "coach-ia" ? "Coach IA" : "Moteur d'adaptation"}</span></div>
                <p className="mt-1 whitespace-pre-line text-sm text-ink-2">{p.rationale}</p>
                <div className="mt-2"><ProposalActions id={p.id} /></div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {refs.ftp && (
        <p className="mt-4 text-xs text-ink-3">FTP {Math.round(refs.ftp.value)} W <OriginBadge origin={refs.ftp.origin} /> · {refs.ftp.source} · {fmtDate(refs.ftp.date, { day: "numeric", month: "short", year: "numeric" })}</p>
      )}
    </>
  );
}
