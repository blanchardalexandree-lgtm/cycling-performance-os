import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, Notice, PageHeader, Stat } from "@/components/ui";
import { StreamChart, ZonesChart } from "@/components/charts";
import { fmtDate, fmtDuration, fmtNum } from "@/lib/format";
import { analyzePacing } from "@/lib/physio/pacing";
import { estimateCda } from "@/lib/physio/aero";
import { timeInPowerZones, POWER_ZONES } from "@/lib/physio/zones";
import { rollingMean } from "@/lib/physio/power";
import { getReferences, powerReference } from "@/lib/references";
import { referencesAt } from "@/lib/activities/recompute";
import { updateActivity, deleteActivity } from "../../actions";
import type { Compliance } from "@/lib/planning/compliance";

export const dynamic = "force-dynamic";

function downsample(stream: { power: number[]; heartRate: number[] }, maxPoints = 600) {
  const n = Math.max(stream.power.length, stream.heartRate.length);
  const step = Math.max(1, Math.floor(n / maxPoints));
  const p30 = stream.power.length >= 30 ? [...new Array(29).fill(null), ...rollingMean(stream.power, 30)] : stream.power;
  const out: Record<string, number>[] = [];
  for (let i = 0; i < n; i += step) out.push({ t: i, power: p30[i] ?? 0, hr: stream.heartRate[i] ?? 0 });
  return out;
}

export default async function ActivityPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string; mass?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const a = await prisma.activity.findFirst({ where: { id, userId: user.id }, include: { stream: true, sources: true, matchedWorkout: true } });
  if (!a) notFound();
  const { refs } = await referencesAt(user.id, a.startTime);
  if (!refs.weight) refs.weight = (await getReferences(user.id)).weight;
  const pref = powerReference(refs);
  const s = a.stream;
  const series = s && (s.power.length || s.heartRate.length) ? downsample(s) : [];

  // Segment analysé (par défaut : toute l'activité) — pour les CLM et tests.
  const from = Math.max(0, Number(sp.from ?? 0) * 60 || 0);
  const to = s ? Math.min(s.power.length, sp.to ? Number(sp.to) * 60 : s.power.length) : 0;
  const seg = s ? { power: s.power.slice(from, to), hr: s.heartRate.slice(from, to), cad: s.cadence.slice(from, to), speed: s.speed.slice(from, to), alt: s.altitude.slice(from, to) } : null;
  const pacing = seg && seg.power.length ? analyzePacing(seg.power, seg.hr, seg.cad) : null;
  const zones = s && s.power.length && pref ? timeInPowerZones(s.power, pref.watts) : null;
  const mass = Number(sp.mass) || (refs.weight ? refs.weight.value + 8.5 : null);
  const aero = seg && mass && seg.speed.length && seg.alt.length ? estimateCda({ power: seg.power, speed: seg.speed, altitude: seg.alt, massKg: mass }) : null;
  const comp = a.matchedWorkout?.compliance as Compliance | null;

  return (
    <>
      <PageHeader title={a.name} subtitle={`${fmtDate(a.startTime, { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })} · sources : ${a.sources.map((x) => x.source).join(", ")}`} />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
        {[
          ["Durée", fmtDuration(a.durationS)], ["Distance", a.distanceM ? fmtNum(a.distanceM / 1000, 1) : "—", "km"], ["D+", fmtNum(a.elevationGainM), "m"],
          ["P moy.", fmtNum(a.avgPower), "W"], ["NP", fmtNum(a.normalizedPower), "W"], ["FC moy.", fmtNum(a.avgHr), "bpm"], ["IF", fmtNum(a.intensityFactor, 2)], ["TSS", fmtNum(a.tss)],
        ].map(([l, v, u]) => <div key={l} className="card card-pad"><Stat label={l!} value={v} unit={u} /></div>)}
      </div>
      <p className="mt-2 text-xs text-ink-3">Charge : {a.tssMethod ?? "non calculée (pas de puissance ni de seuil cardiaque fiable)"}. {a.hrDriftPct != null && `Découplage Pw:HR ${a.hrDriftPct} % (pertinent seulement sur un effort stable).`}</p>

      {a.sources.some((x) => x.restricted) && <div className="mt-3"><Notice>Données issues de Strava : affichées pour toi, mais jamais transmises au coach IA (politique API Strava).</Notice></div>}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Puissance (moyenne glissante 30 s)" className="lg:col-span-2">
          {series.length && s!.power.length ? <StreamChart data={series} dataKey="power" color="var(--color-s1)" unit="W" height={180} /> : <p className="text-sm text-ink-3">Pas de données de puissance.</p>}
          {series.length && s!.heartRate.length ? <><div className="label mt-4">Fréquence cardiaque</div><StreamChart data={series} dataKey="hr" color="var(--color-s2)" unit="bpm" height={130} /></> : null}
        </Card>
        <div className="flex flex-col gap-4">
          {comp && (
            <Card title="Prévu vs réalisé">
              <div className="text-sm"><span className="font-medium">{a.matchedWorkout!.title}</span> · score <span className="num">{comp.score}</span>/100</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div>Durée <span className="num">{comp.durationRatio != null ? Math.round(comp.durationRatio * 100) : "—"} %</span></div>
                <div>Charge <span className="num">{comp.tssRatio != null ? Math.round(comp.tssRatio * 100) : "—"} %</span></div>
              </div>
              <ul className="mt-2 list-disc pl-4 text-xs text-ink-2">{comp.notes.map((n) => <li key={n}>{n}</li>)}</ul>
            </Card>
          )}
          <Card title={`Temps dans les zones${pref ? ` (${pref.label})` : ""}`}>
            {zones ? <ZonesChart zones={POWER_ZONES.map((z) => ({ id: z.id, name: z.name, minutes: zones[z.id] / 60 }))} height={170} /> : <p className="text-sm text-ink-3">Nécessite la puissance et une référence (FTP/CP).</p>}
          </Card>
          <Card title="Annotations">
            <form action={updateActivity} className="space-y-2 text-sm">
              <input type="hidden" name="id" value={a.id} />
              <label className="flex items-center gap-2"><input type="checkbox" name="isRace" defaultChecked={a.isRace} /> Compétition</label>
              <label className="block"><span className="label">RPE (1-10)</span><input name="rpe" type="number" min={1} max={10} defaultValue={a.rpe ?? ""} className="input mt-1" /></label>
              <label className="block"><span className="label">Notes</span><textarea name="notes" defaultValue={a.notes ?? ""} rows={2} className="input mt-1" /></label>
              <button className="btn-ghost">Enregistrer</button>
            </form>
          </Card>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Analyse d'effort / contre-la-montre">
          <form className="mb-3 flex flex-wrap items-end gap-2 text-xs">
            <label><span className="label">Début (min)</span><input name="from" type="number" min={0} defaultValue={sp.from ?? ""} className="input mt-1 w-24 py-1" /></label>
            <label><span className="label">Fin (min)</span><input name="to" type="number" min={1} defaultValue={sp.to ?? ""} className="input mt-1 w-24 py-1" /></label>
            <button className="btn-ghost px-2.5 py-1.5 text-xs">Analyser le segment</button>
          </form>
          {pacing ? (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-3">
                <Stat label="VI" value={fmtNum(pacing.variabilityIndex, 3)} />
                <Stat label="CV puissance" value={fmtNum(pacing.powerCvPct, 1)} unit="%" />
                <Stat label="Dérive FC" value={fmtNum(pacing.hrDriftPct, 1)} unit="%" />
              </div>
              <table className="table">
                <thead><tr><th>Quart</th><th>P moy.</th><th>FC</th><th>Cadence</th></tr></thead>
                <tbody>{pacing.quarters.map((q, i) => <tr key={i}><td>Q{i + 1}</td><td className="num">{q.avgPower} W</td><td className="num">{q.avgHr ?? "—"}</td><td className="num">{q.avgCadence ?? "—"}</td></tr>)}</tbody>
              </table>
              <ul className="list-disc pl-4 text-ink-2">{pacing.verdict.map((v) => <li key={v}>{v}</li>)}</ul>
            </div>
          ) : <p className="text-sm text-ink-3">Nécessite au moins 5 min de puissance sur le segment.</p>}
        </Card>
        <Card title="CdA — estimation expérimentale (élévation virtuelle)">
          {!mass ? <p className="text-sm text-ink-3">Renseigne ton poids (et le poids du vélo dans l'URL ?mass=) pour lancer l'estimation.</p>
            : aero && "error" in aero ? <Notice tone="warn">Estimation refusée : {aero.error}</Notice>
            : aero ? (
              <div className="space-y-2 text-sm">
                <div className="flex items-baseline gap-2"><span className="num text-3xl">{aero.cda.toFixed(3)}</span><span className="text-ink-3">m² · intervalle {aero.low.toFixed(3)} – {aero.high.toFixed(3)}</span></div>
                <div className="text-xs text-ink-3">Écart altitude virtuelle/mesurée : {aero.rmseM} m RMS sur {aero.samples} s. Hypothèses : {aero.assumptions.join(" ; ")}.</div>
                <Notice tone="warn">Résultat expérimental. Fiable seulement sur un protocole adapté (boucle ou aller-retour, sans vent, sans freinage, même position) et avec un capteur de puissance calibré. Ne pas comparer entre sorties aux conditions différentes.</Notice>
              </div>
            ) : <p className="text-sm text-ink-3">Vitesse et altitude nécessaires.</p>}
        </Card>
      </div>
      <form action={deleteActivity.bind(null, a.id)} className="mt-6"><button className="btn-danger text-xs">Supprimer l'activité</button></form>
    </>
  );
}
