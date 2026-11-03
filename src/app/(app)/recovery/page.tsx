import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, PageHeader, StatusPill } from "@/components/ui";
import { TrendChart } from "@/components/charts";
import { saveWellness } from "../actions";
import { readinessToday } from "@/lib/coach/tools";
import { fmtDate, todayISO } from "@/lib/format";
import { iso } from "@/lib/planning/cycle";

export const dynamic = "force-dynamic";

const Scale = ({ name, label, hint, def }: { name: string; label: string; hint: string; def?: number | null }) => (
  <label><span className="label">{label}</span>
    <select name={name} defaultValue={def ?? ""} className="input mt-1"><option value="">—</option>{[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>{v}</option>)}</select>
    <span className="text-[10px] text-ink-3">{hint}</span>
  </label>
);

export default async function Recovery() {
  const user = await requireUser();
  const today = todayISO();
  const [entries, readiness, weights] = await Promise.all([
    prisma.wellnessEntry.findMany({ where: { userId: user.id }, orderBy: { date: "desc" }, take: 60 }),
    readinessToday(user.id),
    prisma.metricValue.findMany({ where: { userId: user.id, key: "WEIGHT" }, orderBy: { date: "asc" }, take: 120 }),
  ]);
  const t = entries.find((e) => iso(e.date) === today);
  const asc = [...entries].reverse();
  return (
    <>
      <PageHeader title="Récupération" subtitle="Sensations, sommeil, HRV, douleurs. Le moteur de sécurité croise plusieurs indicateurs avant toute recommandation." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Saisie du jour" className="lg:col-span-2">
          <form action={saveWellness} className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <label><span className="label">Date</span><input name="date" type="date" defaultValue={today} className="input mt-1" /></label>
            <label><span className="label">Sommeil (h)</span><input name="sleepHours" type="number" step="0.25" min={0} max={16} defaultValue={t?.sleepHours ?? ""} className="input mt-1" /></label>
            <Scale name="sleepQuality" label="Qualité du sommeil" hint="1 mauvaise · 5 excellente" def={t?.sleepQuality} />
            <label><span className="label">HRV rMSSD (ms)</span><input name="hrvMs" type="number" step="0.1" defaultValue={t?.hrvMs ?? ""} className="input mt-1" /><span className="text-[10px] text-ink-3">WHOOP, Garmin, app HRV</span></label>
            <label><span className="label">FC repos (bpm)</span><input name="restingHr" type="number" defaultValue={t?.restingHr ?? ""} className="input mt-1" /></label>
            <Scale name="fatigue" label="Fatigue" hint="1 frais · 5 épuisé" def={t?.fatigue} />
            <Scale name="soreness" label="Courbatures" hint="1 aucune · 5 fortes" def={t?.soreness} />
            <Scale name="motivation" label="Motivation" hint="1 faible · 5 forte" def={t?.motivation} />
            <Scale name="stress" label="Stress (études…)" hint="1 faible · 5 élevé" def={t?.stress} />
            <label><span className="label">Poids (kg)</span><input name="weightKg" type="number" step="0.1" defaultValue={t?.weightKg ?? ""} className="input mt-1" /></label>
            <label className="sm:col-span-2"><span className="label">Douleur inhabituelle</span><input name="pain" defaultValue={t?.pain ?? ""} placeholder="ex. genou droit, tendon d'Achille…" className="input mt-1" /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="illness" defaultChecked={t?.illness} /> Malade</label>
            <label className="sm:col-span-3 lg:col-span-4"><span className="label">Notes</span><input name="notes" defaultValue={t?.notes ?? ""} className="input mt-1" /></label>
            <div><button className="btn-primary">Enregistrer</button></div>
          </form>
        </Card>
        <Card title="État de forme">
          <StatusPill level={readiness.level} />
          <p className="mt-2 text-sm">{readiness.recommendation}</p>
          <ul className="mt-3 space-y-1 text-xs text-ink-2">
            {readiness.signals.map((s) => <li key={s.indicator}>• {s.indicator} : {s.observed}{s.baseline ? ` (réf. ${s.baseline})` : ""} <span className="text-ink-3">[{s.kind}]</span></li>)}
          </ul>
          <p className="mt-3 text-xs text-ink-3">Indicateurs disponibles : {readiness.dataCoverage.join(", ") || "aucun"}. HRV et FC repos ne sont interprétées qu'après 7 jours de référence.</p>
          <p className="mt-2 text-xs text-ink-3">WHOOP : pas d'intégration directe à ce stade (API WHOOP réservée aux développeurs inscrits) ; saisie manuelle en attendant.</p>
        </Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="HRV (ms)">{asc.some((e) => e.hrvMs) ? <TrendChart data={asc.map((e) => ({ label: fmtDate(e.date), value: e.hrvMs }))} unit="ms" /> : <p className="text-sm text-ink-3">Aucune donnée.</p>}</Card>
        <Card title="Sommeil (h)">{asc.some((e) => e.sleepHours) ? <TrendChart data={asc.map((e) => ({ label: fmtDate(e.date), value: e.sleepHours }))} unit="h" color="var(--color-s7)" /> : <p className="text-sm text-ink-3">Aucune donnée.</p>}</Card>
        <Card title="Poids (kg)">{weights.length ? <TrendChart data={weights.map((w) => ({ label: fmtDate(w.date), value: w.value }))} unit="kg" color="var(--color-s3)" /> : <p className="text-sm text-ink-3">Aucune pesée.</p>}</Card>
      </div>
    </>
  );
}
