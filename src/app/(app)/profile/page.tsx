import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, OriginBadge, PageHeader } from "@/components/ui";
import { addConstraint, addMetric, deleteAccount, deleteConstraint, deleteMetric, saveAvailability, saveProfile, saveSettings } from "../actions";
import { METRIC_DEFS } from "@/lib/references";
import { POWER_ZONES, HR_ZONES } from "@/lib/physio/zones";
import { getReferences, powerReference } from "@/lib/references";
import { fmtDate, todayISO } from "@/lib/format";
import { iso } from "@/lib/planning/cycle";

export const dynamic = "force-dynamic";
const WD = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

export default async function Profile() {
  const user = await requireUser();
  const [p, metrics, avail, constraints, settings, refs] = await Promise.all([
    prisma.athleteProfile.findUnique({ where: { userId: user.id } }),
    prisma.metricValue.findMany({ where: { userId: user.id }, orderBy: { date: "desc" }, take: 200 }),
    prisma.weeklyAvailability.findMany({ where: { userId: user.id } }),
    prisma.calendarConstraint.findMany({ where: { userId: user.id, end: { gte: new Date() } }, orderBy: { start: "asc" } }),
    prisma.userSettings.findUnique({ where: { userId: user.id } }),
    getReferences(user.id),
  ]);
  const pref = powerReference(refs);
  const latest = (k: string) => metrics.find((m) => m.key === k);
  return (
    <>
      <PageHeader title="Profil et paramètres" subtitle="Aucune valeur physiologique n'est considérée comme certaine tant qu'elle n'a pas été mesurée ou confirmée." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Profil sportif">
          <form action={saveProfile} className="grid gap-3 sm:grid-cols-2">
            <label><span className="label">Discipline</span><input name="discipline" defaultValue={p?.discipline} className="input mt-1" /></label>
            <label><span className="label">Niveau</span><input name="level" defaultValue={p?.level} className="input mt-1" /></label>
            <label className="sm:col-span-2"><span className="label">Spécialités (séparées par des virgules)</span><input name="specialties" defaultValue={p?.specialties.join(", ")} className="input mt-1" /></label>
            <label><span className="label">Taille (cm, indicative)</span><input name="heightCm" type="number" defaultValue={p?.heightCm ?? ""} className="input mt-1" /></label>
            <label><span className="label">Année de naissance</span><input name="birthYear" type="number" defaultValue={p?.birthYear ?? ""} className="input mt-1" /></label>
            <label className="sm:col-span-2"><span className="label">Objectif général</span><textarea name="generalGoal" rows={2} defaultValue={p?.generalGoal ?? ""} className="input mt-1" /></label>
            <label className="sm:col-span-2"><span className="label">Contraintes</span><textarea name="constraints" rows={2} defaultValue={p?.constraints ?? ""} className="input mt-1" /></label>
            <label><span className="label">Environnement</span><input name="environment" defaultValue={p?.environment.join(", ")} className="input mt-1" /></label>
            <label><span className="label">Matériel</span><input name="equipment" defaultValue={p?.equipment.join(", ")} className="input mt-1" /></label>
            <div><button className="btn-primary">Enregistrer</button></div>
          </form>
        </Card>

        <Card title="Références physiologiques">
          <div className="mb-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            {["FTP", "CP", "W_PRIME", "PMA", "LTHR", "HR_MAX", "HR_REST", "WEIGHT", "MMP_20MIN"].map((k) => {
              const m = latest(k);
              return (
                <div key={k} className="rounded-lg border border-line p-2">
                  <div className="label">{METRIC_DEFS[k].label}</div>
                  {m ? <div className="mt-0.5 flex flex-wrap items-center gap-1"><span className="num">{m.value}</span><span className="text-xs text-ink-3">{m.unit}{m.uncertainty ? ` ± ${m.uncertainty}` : ""}</span><OriginBadge origin={m.origin} /></div> : <div className="mt-0.5 text-xs text-ink-3">inconnu</div>}
                </div>
              );
            })}
          </div>
          <form action={addMetric} className="grid gap-2 sm:grid-cols-3">
            <label><span className="label">Métrique</span><select name="key" className="input mt-1">{Object.entries(METRIC_DEFS).map(([k, d]) => <option key={k} value={k}>{d.label} ({d.unit})</option>)}</select></label>
            <label><span className="label">Valeur</span><input name="value" type="number" step="0.1" required className="input mt-1" /></label>
            <label><span className="label">Date</span><input name="date" type="date" defaultValue={todayISO()} required className="input mt-1" /></label>
            <label><span className="label">Provenance</span><select name="origin" className="input mt-1"><option value="MEASURED">Mesuré (test, capteur)</option><option value="DECLARED">Déclaré (connu, non retesté)</option><option value="ESTIMATED">Estimé</option></select></label>
            <label><span className="label">Source</span><input name="source" required placeholder="test 20 min, labo, balance…" className="input mt-1" /></label>
            <label><span className="label">Incertitude ±</span><input name="uncertainty" type="number" step="0.1" className="input mt-1" /></label>
            <label className="sm:col-span-2"><span className="label">Méthode / protocole</span><input name="method" placeholder="ex. 95 % du 20 min, rampe 25 W/min…" className="input mt-1" /></label>
            <div className="flex items-end"><button className="btn-primary w-full">Ajouter</button></div>
          </form>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-ink-3">Historique ({metrics.length})</summary>
            <table className="table mt-2">
              <tbody>{metrics.map((m) => (
                <tr key={m.id}><td>{METRIC_DEFS[m.key]?.label ?? m.key}</td><td className="num">{m.value} {m.unit}</td><td><OriginBadge origin={m.origin} /></td><td className="text-ink-3">{fmtDate(m.date, { day: "numeric", month: "short", year: "2-digit" })}</td><td className="text-xs text-ink-3">{m.source}{m.method ? ` · ${m.method}` : ""}</td><td><form action={deleteMetric.bind(null, m.id)}><button className="text-xs text-ink-3 hover:text-bad">×</button></form></td></tr>
              ))}</tbody>
            </table>
          </details>
        </Card>

        <Card title="Zones">
          {pref ? (
            <table className="table">
              <thead><tr><th>Zone</th><th>Nom</th><th>% réf.</th><th>Watts</th></tr></thead>
              <tbody>{POWER_ZONES.map((z) => <tr key={z.id}><td>{z.id}</td><td>{z.name}</td><td className="num">{Math.round(z.low * 100)}–{z.high > 5 ? "max" : Math.round(z.high * 100)} %</td><td className="num">{Math.round(z.low * pref.watts)}–{z.high > 5 ? "max" : Math.round(z.high * pref.watts)} W</td></tr>)}</tbody>
            </table>
          ) : <p className="text-sm text-ink-3">Zones de puissance disponibles dès qu'une FTP (mesurée ou déclarée) ou une CP est enregistrée.</p>}
          {refs.lthr ? (
            <table className="table mt-3">
              <thead><tr><th>Zone FC</th><th>Nom</th><th>bpm</th></tr></thead>
              <tbody>{HR_ZONES.map((z) => <tr key={z.id}><td>{z.id}</td><td>{z.name}</td><td className="num">{Math.round(z.low * refs.lthr!.value)}–{Math.round(z.high * refs.lthr!.value)}</td></tr>)}</tbody>
            </table>
          ) : <p className="mt-2 text-sm text-ink-3">Zones cardiaques : renseigne ta FC au seuil (LTHR).</p>}
          {pref && <p className="mt-2 text-xs text-ink-3">Référence utilisée : {pref.label} {Math.round(pref.watts)} W.</p>}
        </Card>

        <Card title="Disponibilités hebdomadaires">
          <form action={saveAvailability} className="space-y-2">
            {WD.map((d, i) => {
              const a = avail.find((x) => x.weekday === i);
              return (
                <div key={d} className="flex items-center gap-3 text-sm">
                  <span className="w-24">{d}</span>
                  <input name={`min_${i}`} type="number" min={0} max={600} defaultValue={a?.maxMinutes ?? 90} className="input w-24 py-1" aria-label={`Minutes ${d}`} />
                  <span className="text-ink-3">min max</span>
                  <label className="ml-auto flex items-center gap-1.5 text-xs text-ink-3"><input type="checkbox" name={`out_${i}`} defaultChecked={a?.outdoorOk ?? true} /> extérieur possible</label>
                </div>
              );
            })}
            <button className="btn-primary">Enregistrer</button>
          </form>
        </Card>

        <Card title="Contraintes : cours, examens, stages, déplacements" className="lg:col-span-2">
          <form action={addConstraint} className="grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
            <label><span className="label">Type</span><select name="kind" className="input mt-1"><option value="cours">Cours</option><option value="examen">Examen</option><option value="stage">Stage clinique</option><option value="deplacement">Déplacement</option><option value="travail">Travail</option><option value="autre">Autre</option></select></label>
            <label className="lg:col-span-2"><span className="label">Intitulé</span><input name="title" required className="input mt-1" /></label>
            <label><span className="label">Du</span><input name="start" type="date" required className="input mt-1" /></label>
            <label><span className="label">Au</span><input name="end" type="date" required className="input mt-1" /></label>
            <label><span className="label">Max (min/jour)</span><input name="maxTrainingMin" type="number" min={0} className="input mt-1" /></label>
            <div className="flex flex-col justify-end gap-1 text-xs">
              <label className="flex items-center gap-1.5"><input type="checkbox" name="indoorOnly" /> Home trainer seulement</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" name="noTraining" /> Aucun vélo possible</label>
            </div>
            <div className="sm:col-span-3 lg:col-span-7"><button className="btn-primary">Ajouter</button> <span className="ml-2 text-xs text-ink-3">Régénère ensuite le plan dans le Calendrier pour l'adapter.</span></div>
          </form>
          <ul className="mt-3 divide-y divide-line text-sm">
            {constraints.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="chip">{c.kind}</span><span>{c.title}</span>
                <span className="text-ink-3">{iso(c.start)} → {iso(c.end)}</span>
                <span className="text-xs text-ink-3">{c.noTraining ? "sans vélo" : c.maxTrainingMin != null ? `≤ ${c.maxTrainingMin} min` : ""}{c.indoorOnly ? " · home trainer" : ""}</span>
                <form action={deleteConstraint.bind(null, c.id)} className="ml-auto"><button className="text-xs text-ink-3 hover:text-bad">Supprimer</button></form>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Préférences">
          <form action={saveSettings} className="flex items-end gap-2">
            <label className="flex-1"><span className="label">Export de séance préféré</span><select name="preferredExport" defaultValue={settings?.preferredExport ?? "zwo"} className="input mt-1"><option value="zwo">Zwift (.zwo)</option><option value="mrc">MRC (.mrc)</option><option value="fit">Garmin (.fit)</option></select></label>
            <button className="btn-ghost">Enregistrer</button>
          </form>
          <div className="mt-4 text-sm">
            <div className="label">Mode d'adaptation automatique</div>
            <p className="mt-1 text-ink-2">Désactivé. Toutes les modifications proposées par le moteur ou le coach attendent ta validation. Le mode automatique ne sera activable qu'avec des règles explicites que tu choisiras (ex. « appliquer seulement les réductions de charge »).</p>
          </div>
        </Card>

        <Card title="Confidentialité et données">
          <ul className="list-disc space-y-1 pl-4 text-sm text-ink-2">
            <li>Données stockées sur ton serveur PostgreSQL, isolées par compte.</li>
            <li>Jetons OAuth et clés API chiffrés (AES-256-GCM), jamais envoyés au navigateur.</li>
            <li>Coach IA : seules les données nécessaires à la question sont transmises au fournisseur du modèle ; les données Strava sont exclues.</li>
            <li>Voir PRIVACY.md pour la liste complète des données collectées.</li>
          </ul>
          <form action={deleteAccount} className="mt-4 flex flex-wrap items-end gap-2">
            <label><span className="label text-bad">Supprimer le compte et toutes les données</span><input name="confirm" placeholder="Taper SUPPRIMER" className="input mt-1" /></label>
            <button className="btn-danger">Supprimer définitivement</button>
          </form>
        </Card>
      </div>
    </>
  );
}
