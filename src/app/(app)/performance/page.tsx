import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, Notice, PageHeader, Stat } from "@/components/ui";
import { PmcChart, PowerCurveChart, TrendChart } from "@/components/charts";
import { RunButton } from "@/components/client-actions";
import { saveCpEstimate } from "../actions";
import { loadSummary } from "@/lib/coach/tools";
import { fitCriticalPower, cpPredict, STANDARD_DURATIONS } from "@/lib/physio/power";
import { getReferences } from "@/lib/references";
import { durationLabel, fmtDate, fmtNum } from "@/lib/format";
import { addDays } from "@/lib/planning/cycle";

export const dynamic = "force-dynamic";

type Best = { durationS: number; watts: number; date: Date; activityId: string; isRace: boolean };

function curveOf(rows: Best[]) {
  const m = new Map<number, Best>();
  for (const r of rows) if (!m.has(r.durationS) || m.get(r.durationS)!.watts < r.watts) m.set(r.durationS, r);
  return [...m.values()].sort((a, b) => a.durationS - b.durationS);
}

const PROFILE = [
  { label: "Neuromusculaire", d: 5 }, { label: "Anaérobie", d: 60 }, { label: "Puissance aérobie (PMA)", d: 300 }, { label: "Seuil", d: 1200 }, { label: "Endurance de seuil", d: 2400 },
];

export default async function Performance({ searchParams }: { searchParams: Promise<{ filter?: string; period?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const filter = sp.filter === "race" ? "race" : sp.filter === "training" ? "training" : "all";
  const period = Number(sp.period) || 90;
  const today = new Date().toISOString().slice(0, 10);
  const since = new Date(addDays(today, -period * 2) + "T00:00:00Z");
  const where = { userId: user.id, date: { gte: since }, ...(filter === "race" ? { isRace: true } : filter === "training" ? { isRace: false } : {}) };
  const [rows, refs, load, allTime, races] = await Promise.all([
    prisma.powerBest.findMany({ where, select: { durationS: true, watts: true, date: true, activityId: true, isRace: true } }),
    getReferences(user.id),
    loadSummary(user.id, 180),
    prisma.powerBest.findMany({ where: { userId: user.id }, select: { durationS: true, watts: true, date: true, activityId: true, isRace: true } }),
    prisma.activity.findMany({ where: { userId: user.id, isRace: true }, orderBy: { startTime: "desc" }, take: 12, select: { id: true, name: true, startTime: true, durationS: true, normalizedPower: true, avgPower: true, avgHr: true, intensityFactor: true } }),
  ]);
  const cut = new Date(addDays(today, -period) + "T00:00:00Z");
  const current = curveOf(rows.filter((r) => r.date >= cut));
  const previous = curveOf(rows.filter((r) => r.date < cut));
  const records = curveOf(allTime);
  const cp = fitCriticalPower(current.map((c) => ({ durationS: c.durationS, watts: c.watts })));
  const weight = refs.weight?.value ?? null;

  // Évolution hebdomadaire du meilleur 20 min et 5 min
  const weekKey = (d: Date) => addDays(d.toISOString().slice(0, 10), -((d.getUTCDay() + 6) % 7));
  const weekly = (dur: number) => {
    const m = new Map<string, number>();
    for (const r of allTime.filter((x) => x.durationS === dur)) {
      const k = weekKey(r.date);
      m.set(k, Math.max(m.get(k) ?? 0, r.watts));
    }
    return [...m.entries()].sort().slice(-26).map(([k, v]) => ({ label: fmtDate(k), value: v }));
  };

  const filters: [string, string][] = [["all", "Tout"], ["training", "Entraînement"], ["race", "Compétition"]];
  return (
    <>
      <PageHeader title="Performance" subtitle="Courbe de puissance, profil, records et charge. Les comparaisons mélangent des capteurs différents si tu en utilises plusieurs : vérifie la source." />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="flex rounded-lg border border-line p-0.5">
          {filters.map(([f, l]) => <Link key={f} href={`/performance?filter=${f}&period=${period}`} className={`rounded-md px-3 py-1 text-sm ${f === filter ? "bg-surface-2" : "text-ink-3"}`}>{l}</Link>)}
        </div>
        <div className="flex rounded-lg border border-line p-0.5">
          {[28, 42, 90, 180, 365].map((p) => <Link key={p} href={`/performance?filter=${filter}&period=${p}`} className={`rounded-md px-3 py-1 text-sm ${p === period ? "bg-surface-2" : "text-ink-3"}`}>{p} j</Link>)}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={`Courbe de puissance maximale — ${period} derniers jours vs ${period} jours précédents`} className="lg:col-span-2">
          {current.length ? (
            <PowerCurveChart series={[
              { name: `${period} derniers jours`, color: "var(--color-s1)", points: current },
              ...(previous.length ? [{ name: "Période précédente", color: "var(--color-s2)", points: previous }] : []),
            ]} />
          ) : <p className="text-sm text-ink-3">Aucune donnée de puissance sur la période.</p>}
        </Card>
        <Card title="Puissance critique (modèle 2 paramètres)">
          {cp ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="CP" value={Math.round(cp.cp)} unit="W" hint={`± ${Math.round(cp.cpSe)} W`} origin="ESTIMATED" />
                <Stat label="W′" value={(cp.wPrime / 1000).toFixed(1)} unit="kJ" hint={`± ${(cp.wPrimeSe / 1000).toFixed(1)} kJ`} origin="ESTIMATED" />
              </div>
              <div className="text-xs text-ink-3">R² {cp.r2.toFixed(3)} sur {cp.points.length} durées (2-20 min). Puissance prédite : 20 min {Math.round(cpPredict(cp, 1200))} W · 30 min {Math.round(cpPredict(cp, 1800))} W (au-delà de 30 min, le modèle surestime).</div>
              <Notice>Valable uniquement si ces efforts étaient réellement maximaux. Sinon, le test « 3 + 12 min » donne une estimation fiable.</Notice>
              <RunButton action={saveCpEstimate} label="Enregistrer comme estimation" />
            </div>
          ) : <p className="text-sm text-ink-3">Il faut au moins 3 efforts maximaux entre 2 et 20 minutes sur la période. Planifie le test « puissance critique » depuis Séances.</p>}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Records personnels (tout l'historique)" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="table min-w-[520px]">
              <thead><tr><th>Durée</th><th>Record</th><th>W/kg</th><th>Période ({period} j)</th><th>Date du record</th><th>Contexte</th></tr></thead>
              <tbody>
                {STANDARD_DURATIONS.filter((d) => [5, 15, 30, 60, 180, 300, 480, 720, 1200, 2400, 3600].includes(d)).map((d) => {
                  const r = records.find((x) => x.durationS === d);
                  const c = current.find((x) => x.durationS === d);
                  return (
                    <tr key={d}>
                      <td>{durationLabel(d)}</td>
                      <td className="num">{r ? `${Math.round(r.watts)} W` : "—"}</td>
                      <td className="num">{r && weight ? (r.watts / weight).toFixed(2) : "—"}</td>
                      <td className="num">{c ? `${Math.round(c.watts)} W` : "—"}{c && r && c.watts >= r.watts ? <span className="ml-1 text-accent">PR</span> : null}</td>
                      <td className="text-ink-3">{r ? <Link className="hover:text-ink" href={`/activities/${r.activityId}`}>{fmtDate(r.date, { day: "numeric", month: "short", year: "numeric" })}</Link> : "—"}</td>
                      <td className="text-ink-3">{r ? (r.isRace ? "course" : "entraînement") : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Profil de puissance">
          <ul className="space-y-2.5">
            {PROFILE.map((p) => {
              const r = current.find((x) => x.durationS === p.d);
              const rel = r && weight ? r.watts / weight : null;
              return (
                <li key={p.d}>
                  <div className="flex justify-between text-sm"><span>{p.label} <span className="text-ink-3">({durationLabel(p.d)})</span></span><span className="num">{r ? `${Math.round(r.watts)} W` : "—"}{rel ? ` · ${rel.toFixed(2)} W/kg` : ""}</span></div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-ink-3">Profil basé sur tes meilleures valeurs de la période, pas sur des tests standardisés : une durée jamais sollicitée à fond paraîtra faible. {!weight && "Ajoute ton poids pour les W/kg."}</p>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Évolution du meilleur 20 min (par semaine)">{weekly(1200).length ? <TrendChart data={weekly(1200)} unit="W" /> : <p className="text-sm text-ink-3">Pas encore de données.</p>}</Card>
        <Card title="Évolution du meilleur 5 min (par semaine)">{weekly(300).length ? <TrendChart data={weekly(300)} unit="W" color="var(--color-s7)" /> : <p className="text-sm text-ink-3">Pas encore de données.</p>}</Card>
      </div>

      <Card title="Charge d'entraînement — 180 jours" className="mt-4">
        {load.series.some((p) => p.tss > 0) ? <PmcChart data={load.series} height={300} /> : <p className="text-sm text-ink-3">Pas de charge calculable.</p>}
        <p className="mt-2 text-xs text-ink-3">CTL = moyenne exponentielle 42 j du TSS ; ATL = 7 j ; TSB = CTL − ATL de la veille. TSS calculé seulement avec puissance + référence fiable (ou FC + LTHR, approximation signalée). {load.activitiesWithoutLoad} activité(s) sans charge sur la période.</p>
      </Card>

      <Card title="Comparaison des courses" className="mt-4">
        {races.length ? (
          <div className="overflow-x-auto">
            <table className="table min-w-[560px]">
              <thead><tr><th>Date</th><th>Course</th><th>Durée</th><th>NP</th><th>P moy.</th><th>FC</th><th>IF</th></tr></thead>
              <tbody>{races.map((r) => (
                <tr key={r.id}><td className="text-ink-3">{fmtDate(r.startTime, { day: "numeric", month: "short", year: "2-digit" })}</td><td><Link className="hover:text-accent" href={`/activities/${r.id}`}>{r.name}</Link></td><td className="num">{Math.round(r.durationS / 60)}′</td><td className="num">{fmtNum(r.normalizedPower)}</td><td className="num">{fmtNum(r.avgPower)}</td><td className="num">{fmtNum(r.avgHr)}</td><td className="num">{fmtNum(r.intensityFactor, 2)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="text-sm text-ink-3">Aucune course identifiée. Les activités tombant un jour d'objectif sont marquées automatiquement ; tu peux aussi cocher « Compétition » sur une activité.</p>}
      </Card>
    </>
  );
}
