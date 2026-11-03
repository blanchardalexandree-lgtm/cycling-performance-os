import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, Notice, PageHeader } from "@/components/ui";
import { RunButton } from "@/components/client-actions";
import { integrationCatalog } from "@/lib/integrations/catalog";
import { stravaConfigured, STRAVA_SCOPES } from "@/lib/integrations/strava";
import { garminDisconnect, stravaDisconnectAction, stravaSyncAction } from "../actions";
import { GarminKeyForm } from "./garmin-form";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const BADGE: Record<string, [string, string]> = {
  available: ["Disponible", "border-good/40 text-good"], "needs-config": ["Configuration requise", "border-warn/40 text-warn"],
  blocked: ["Bloqué", "border-bad/40 text-bad"], partial: ["Partiel", "border-warn/40 text-warn"],
};

export default async function Integrations({ searchParams }: { searchParams: Promise<{ error?: string; connected?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [accounts, logs] = await Promise.all([
    prisma.integrationAccount.findMany({ where: { userId: user.id } }),
    prisma.syncLog.findMany({ where: { userId: user.id }, orderBy: { startedAt: "desc" }, take: 10 }),
  ]);
  const strava = accounts.find((a) => a.provider === "strava");
  const garmin = accounts.find((a) => a.provider === "garmin");
  const catalog = integrationCatalog({ stravaConfigured: stravaConfigured() });
  return (
    <>
      <PageHeader title="Intégrations" subtitle="Chaque connecteur est indépendant : l'échec de l'un n'empêche pas d'utiliser les autres. Aucune connexion n'est simulée." />
      {sp.error && <div className="mb-4"><Notice tone="bad">Connexion impossible : {sp.error === "strava_not_configured" ? "identifiants Strava absents du serveur (.env)." : sp.error === "strava_state" ? "vérification de sécurité échouée, recommence." : sp.error === "strava_denied" ? "autorisation refusée sur Strava." : sp.error}</Notice></div>}
      {sp.connected === "strava" && <div className="mb-4"><Notice>Strava connecté. Première synchronisation (90 jours) effectuée : voir l'historique ci-dessous.</Notice></div>}
      <div className="grid gap-4 lg:grid-cols-2">
        {catalog.map((c) => (
          <Card key={c.id}>
            <div className="flex items-center gap-2"><h3 className="font-semibold">{c.name}</h3><span className={`chip ${BADGE[c.status][1]}`}>{BADGE[c.status][0]}</span></div>
            <p className="mt-1 text-sm text-ink-2">{c.summary}</p>

            {c.id === "strava" && (
              <div className="mt-3 rounded-lg border border-line p-3 text-sm">
                {strava?.status === "connected" ? (
                  <>
                    <div>Connecté (athlète {strava.externalUserId}) · autorisations : {strava.scopes.join(", ")}</div>
                    <div className="text-ink-3">Dernière synchronisation : {strava.lastSyncAt ? fmtDate(strava.lastSyncAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "jamais"}</div>
                    {strava.lastError && <div className="text-bad">{strava.lastError}</div>}
                    <div className="mt-2 flex flex-wrap gap-2"><RunButton action={stravaSyncAction} label="Synchroniser maintenant" className="btn-primary" /><form action={stravaDisconnectAction}><button className="btn-ghost">Déconnecter</button></form></div>
                  </>
                ) : stravaConfigured() ? (
                  <>
                    {strava?.status === "revoked" && <div className="mb-2 text-warn">{strava.lastError ?? "Accès révoqué."}</div>}
                    <a href="/api/integrations/strava/connect" className="btn-primary">Connecter Strava</a>
                    <div className="mt-1 text-xs text-ink-3">Autorisations demandées : {STRAVA_SCOPES.join(", ")} (lecture seule).</div>
                  </>
                ) : <div className="text-ink-3">Le serveur n'a pas encore d'identifiants d'application Strava.</div>}
              </div>
            )}

            {c.id === "garmin" && (
              <div className="mt-3 rounded-lg border border-line p-3 text-sm">
                {garmin && <div className="mb-2">Statut : <b>{garmin.status === "connected" ? "clé valide" : garmin.status === "pending" ? "clé enregistrée, non testée" : "erreur"}</b>{garmin.lastError && <span className="text-bad"> — {garmin.lastError}</span>}</div>}
                <GarminKeyForm />
                {garmin && <form action={garminDisconnect} className="mt-2"><button className="text-xs text-ink-3 hover:text-bad">Supprimer la clé</button></form>}
              </div>
            )}

            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div><div className="label mb-1">Données accessibles</div><ul className="list-disc space-y-0.5 pl-4 text-ink-2">{c.canRead.map((x) => <li key={x}>{x}</li>)}</ul></div>
              <div><div className="label mb-1">Limites</div><ul className="list-disc space-y-0.5 pl-4 text-ink-2">{c.cannot.map((x) => <li key={x}>{x}</li>)}</ul></div>
            </div>
            {c.todo.length > 0 && <div className="mt-3"><div className="label mb-1">À faire de ton côté</div><ol className="list-decimal space-y-0.5 pl-4 text-sm text-ink-2">{c.todo.map((x) => <li key={x}>{x}</li>)}</ol></div>}
            <div className="mt-3 flex flex-wrap gap-3 text-xs">{c.docs.map((d) => <a key={d.url} href={d.url} target="_blank" rel="noreferrer" className="text-ink-3 underline hover:text-ink">{d.label}</a>)}</div>
          </Card>
        ))}
      </div>
      <Card title="Historique des synchronisations" className="mt-4">
        {logs.length ? (
          <table className="table">
            <thead><tr><th>Date</th><th>Service</th><th>Statut</th><th>Importées</th><th>Fusionnées</th><th>Ignorées</th><th>Message</th></tr></thead>
            <tbody>{logs.map((l) => (
              <tr key={l.id}><td className="text-ink-3">{fmtDate(l.startedAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td><td>{l.provider}</td><td className={l.status === "success" ? "text-good" : l.status === "error" ? "text-bad" : "text-warn"}>{l.status}</td><td className="num">{l.imported}</td><td className="num">{l.merged}</td><td className="num">{l.skipped}</td><td className="text-xs text-ink-3">{l.message}</td></tr>
            ))}</tbody>
          </table>
        ) : <p className="text-sm text-ink-3">Aucune synchronisation.</p>}
      </Card>
    </>
  );
}
