/**
 * Connecteur Strava officiel (OAuth 2.0, API v3).
 * Doc : https://developers.strava.com/docs/getting-started/ ; quotas : https://developers.strava.com/docs/rate-limits/
 *
 * Points d'attention vérifiés (novembre 2026) :
 *  - Créer une application Strava exige un abonnement Strava payant ; une nouvelle app est en
 *    « single-player mode » (seul le compte du développeur peut se connecter) : suffisant ici.
 *  - Quotas par application : en-têtes X-RateLimit-* et X-ReadRateLimit-* (« 15 min, jour »).
 *    Le connecteur lit ces en-têtes et s'arrête avant épuisement ; 429 → arrêt propre.
 *  - La politique API Strava interdit l'usage des données Strava dans des applications d'IA
 *    (prompts, RAG…). Les activités importées de Strava sont donc marquées `restricted` et
 *    EXCLUES du contexte envoyé au modèle de langage. Les calculs déterministes restent possibles.
 *  - Portée demandée : activity:read_all (activités privées incluses), rien de plus.
 */
import { prisma } from "../db";
import { decrypt, encrypt } from "../crypto";
import { ingestActivity } from "../activities/ingest";
import type { ParsedActivity } from "../import/types";

const AUTH_URL = "https://www.strava.com/oauth/authorize";
const TOKEN_URL = "https://www.strava.com/oauth/token";
const API = "https://www.strava.com/api/v3";
export const STRAVA_SCOPES = ["read", "activity:read_all"];
const CYCLING_TYPES = new Set(["Ride", "VirtualRide", "GravelRide", "MountainBikeRide", "EBikeRide", "Velomobile", "Handcycle"]);
const STREAM_KEYS = "time,watts,heartrate,cadence,velocity_smooth,altitude,distance,latlng";
/** Nombre max d'appels de flux par synchronisation (préserve le quota quotidien). */
export const MAX_STREAM_CALLS_PER_SYNC = 40;

export function stravaConfigured(): boolean {
  return Boolean(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET);
}

export function buildAuthorizeUrl(state: string, origin?: string): string {
  const u = new URL(AUTH_URL);
  u.searchParams.set("client_id", process.env.STRAVA_CLIENT_ID!);
  u.searchParams.set("redirect_uri", `${(origin ?? process.env.APP_URL ?? "").replace(/\/+$/, "")}/api/integrations/strava/callback`);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("approval_prompt", "auto");
  u.searchParams.set("scope", STRAVA_SCOPES.join(","));
  u.searchParams.set("state", state);
  return u.toString();
}

export interface RateLimitState {
  shortUsage: number;
  shortLimit: number;
  dailyUsage: number;
  dailyLimit: number;
}

export function parseRateLimit(h: Headers): RateLimitState | null {
  const lim = h.get("x-readratelimit-limit") ?? h.get("x-ratelimit-limit");
  const use = h.get("x-readratelimit-usage") ?? h.get("x-ratelimit-usage");
  if (!lim || !use) return null;
  const [sl, dl] = lim.split(",").map(Number);
  const [su, du] = use.split(",").map(Number);
  return { shortLimit: sl, dailyLimit: dl, shortUsage: su, dailyUsage: du };
}

export function nearLimit(r: RateLimitState | null, margin = 5): boolean {
  return !!r && (r.shortUsage >= r.shortLimit - margin || r.dailyUsage >= r.dailyLimit - margin);
}

export class StravaError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.STRAVA_CLIENT_ID!, client_secret: process.env.STRAVA_CLIENT_SECRET!, ...body }),
  });
  if (!res.ok) throw new StravaError(`Échange de jeton Strava refusé (${res.status})`, res.status);
  return (await res.json()) as { access_token: string; refresh_token: string; expires_at: number; athlete?: { id: number } };
}

export async function exchangeCode(userId: string, code: string, grantedScope: string) {
  const scopes = grantedScope.split(",").filter(Boolean);
  if (!scopes.includes("activity:read_all") && !scopes.includes("activity:read")) {
    throw new StravaError("Autorisation « lecture des activités » non accordée : impossible d'importer les sorties.");
  }
  const t = await tokenRequest({ code, grant_type: "authorization_code" });
  await prisma.integrationAccount.upsert({
    where: { userId_provider: { userId, provider: "strava" } },
    create: { userId, provider: "strava", externalUserId: String(t.athlete?.id ?? ""), accessTokenEnc: encrypt(t.access_token), refreshTokenEnc: encrypt(t.refresh_token), expiresAt: new Date(t.expires_at * 1000), scopes, status: "connected" },
    update: { externalUserId: String(t.athlete?.id ?? ""), accessTokenEnc: encrypt(t.access_token), refreshTokenEnc: encrypt(t.refresh_token), expiresAt: new Date(t.expires_at * 1000), scopes, status: "connected", lastError: null },
  });
}

/** Renvoie un jeton d'accès valide, en le renouvelant si nécessaire (marge 5 min). */
export async function getAccessToken(userId: string): Promise<string> {
  const acc = await prisma.integrationAccount.findUnique({ where: { userId_provider: { userId, provider: "strava" } } });
  if (!acc || acc.status === "revoked" || !acc.refreshTokenEnc) throw new StravaError("Strava n'est pas connecté.");
  if (acc.accessTokenEnc && acc.expiresAt && acc.expiresAt.getTime() - Date.now() > 300_000) return decrypt(acc.accessTokenEnc);
  try {
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: decrypt(acc.refreshTokenEnc) });
    await prisma.integrationAccount.update({ where: { id: acc.id }, data: { accessTokenEnc: encrypt(t.access_token), refreshTokenEnc: encrypt(t.refresh_token), expiresAt: new Date(t.expires_at * 1000) } });
    return t.access_token;
  } catch (e) {
    if (e instanceof StravaError && (e.status === 400 || e.status === 401)) {
      await prisma.integrationAccount.update({ where: { id: acc.id }, data: { status: "revoked", accessTokenEnc: null, refreshTokenEnc: null, lastError: "Autorisation révoquée ou expirée : reconnecter Strava." } });
    }
    throw e;
  }
}

export interface StravaSummary {
  id: number;
  name: string;
  type: string;
  sport_type?: string;
  start_date: string;
  elapsed_time: number;
  moving_time: number;
  distance: number;
  total_elevation_gain: number;
  trainer?: boolean;
  device_watts?: boolean;
  workout_type?: number | null; // 11 = course (vélo)
}

type StreamSet = Partial<Record<"time" | "watts" | "heartrate" | "cadence" | "velocity_smooth" | "altitude" | "distance", { data: number[] }> & { latlng: { data: [number, number][] } }>;

/** Convertit un résumé + flux Strava au format interne commun. */
export function mapStravaActivity(a: StravaSummary, streams: StreamSet | null): ParsedActivity {
  const t = streams?.time?.data ?? [];
  const pick = (k: keyof StreamSet) => {
    const d = (streams?.[k] as { data: number[] } | undefined)?.data;
    return t.map((_, i) => (d && d[i] != null ? d[i] : null));
  };
  const ll = streams?.latlng?.data;
  const sport = a.sport_type ?? a.type;
  return {
    name: a.name,
    sport: CYCLING_TYPES.has(sport) ? "cycling" : "other",
    startTime: new Date(a.start_date),
    elapsedS: a.elapsed_time,
    movingS: a.moving_time,
    distanceM: a.distance,
    elevationGainM: a.total_elevation_gain,
    indoor: Boolean(a.trainer) || sport === "VirtualRide",
    samples: {
      t,
      power: a.device_watts ? pick("watts") : t.map(() => null), // puissance estimée par Strava ignorée
      hr: pick("heartrate"),
      cadence: pick("cadence"),
      speed: pick("velocity_smooth"),
      altitude: pick("altitude"),
      distance: pick("distance"),
      lat: t.map((_, i) => ll?.[i]?.[0] ?? null),
      lng: t.map((_, i) => ll?.[i]?.[1] ?? null),
    },
  };
}

async function api<T>(token: string, path: string): Promise<{ data: T; rate: RateLimitState | null }> {
  const res = await fetch(API + path, { headers: { Authorization: `Bearer ${token}` } });
  const rate = parseRateLimit(res.headers);
  if (res.status === 429) throw new StravaError("Quota Strava atteint : la synchronisation reprendra plus tard.", 429);
  if (res.status === 401) throw new StravaError("Jeton Strava refusé : reconnecter le compte.", 401);
  if (!res.ok) throw new StravaError(`Erreur API Strava ${res.status} (${path.split("?")[0]})`, res.status);
  return { data: (await res.json()) as T, rate };
}

/**
 * Synchronisation incrémentale : activités postérieures au curseur (epoch de la dernière importée).
 * Première synchronisation : 90 jours d'historique par défaut.
 */
export async function syncStrava(userId: string, opts: { historyDays?: number; onlyActivityId?: number } = {}) {
  const log = await prisma.syncLog.create({ data: { userId, provider: "strava", status: "running" } });
  let imported = 0, merged = 0, skipped = 0, streamCalls = 0;
  let message: string | null = null;
  let status = "success";
  try {
    const token = await getAccessToken(userId);
    const acc = await prisma.integrationAccount.findUniqueOrThrow({ where: { userId_provider: { userId, provider: "strava" } } });
    const after = acc.syncCursor ? Number(acc.syncCursor) : Math.floor(Date.now() / 1000) - (opts.historyDays ?? 90) * 86400;
    let cursor = after;
    let list: StravaSummary[] = [];
    if (opts.onlyActivityId) {
      list = [(await api<StravaSummary>(token, `/activities/${opts.onlyActivityId}`)).data];
    } else {
      for (let page = 1; page <= 10; page++) {
        const r = await api<StravaSummary[]>(token, `/athlete/activities?after=${after}&per_page=100&page=${page}`);
        list.push(...r.data);
        if (r.data.length < 100 || nearLimit(r.rate, 10)) break;
      }
    }
    list.sort((a, b) => a.start_date.localeCompare(b.start_date));
    for (const a of list) {
      const sport = a.sport_type ?? a.type;
      if (!CYCLING_TYPES.has(sport)) { skipped++; continue; }
      const known = await prisma.activitySourceRecord.findUnique({ where: { userId_source_externalId: { userId, source: "STRAVA", externalId: String(a.id) } } });
      if (known) { skipped++; cursor = Math.max(cursor, Date.parse(a.start_date) / 1000); continue; }
      if (streamCalls >= MAX_STREAM_CALLS_PER_SYNC) { status = "partial"; message = `Limite de ${MAX_STREAM_CALLS_PER_SYNC} activités détaillées par synchronisation atteinte : relancer plus tard.`; break; }
      // Une activité sans flux (saisie manuelle, flux indisponible → 404) est importée avec son résumé seul ;
      // une erreur sur une activité n'interrompt pas toute la synchronisation (sauf quota / jeton).
      let s: { data: StreamSet | null; rate: RateLimitState | null } = { data: null, rate: null };
      try {
        s = await api<StreamSet>(token, `/activities/${a.id}/streams?keys=${STREAM_KEYS}&key_by_type=true`);
      } catch (e) {
        if (!(e instanceof StravaError) || (e.status !== 404 && e.status !== 403)) throw e;
      }
      streamCalls++;
      try {
        const parsed = mapStravaActivity(a, s.data);
        const res = await ingestActivity({
          userId, source: "STRAVA", externalId: String(a.id), parsed, restricted: true, isRace: a.workout_type === 11,
          raw: { id: a.id, name: a.name, type: sport, start_date: a.start_date, workout_type: a.workout_type ?? null },
        });
        if (res.status === "created") imported++; else if (res.status === "merged") merged++; else skipped++;
      } catch (e) {
        skipped++;
        console.error("strava ingest", a.id, e instanceof Error ? e.message : "");
      }
      cursor = Math.max(cursor, Date.parse(a.start_date) / 1000);
      if (s.rate && nearLimit(s.rate)) { status = "partial"; message = "Quota Strava presque atteint : synchronisation interrompue proprement."; break; }
    }
    await prisma.integrationAccount.update({ where: { id: acc.id }, data: { lastSyncAt: new Date(), syncCursor: String(Math.floor(cursor)), lastError: null } });
  } catch (e) {
    status = "error";
    message = e instanceof Error ? e.message : "Erreur inconnue";
    await prisma.integrationAccount.updateMany({ where: { userId, provider: "strava" }, data: { lastError: message } });
  }
  await prisma.syncLog.update({ where: { id: log.id }, data: { finishedAt: new Date(), status, imported, merged, skipped, message } });
  return { status, imported, merged, skipped, message };
}

/** Révocation côté Strava puis suppression locale des jetons. */
export async function disconnectStrava(userId: string) {
  const acc = await prisma.integrationAccount.findUnique({ where: { userId_provider: { userId, provider: "strava" } } });
  if (!acc) return;
  try {
    if (acc.accessTokenEnc) {
      await fetch("https://www.strava.com/oauth/deauthorize", { method: "POST", headers: { Authorization: `Bearer ${decrypt(acc.accessTokenEnc)}` } });
    }
  } catch {
    /* la suppression locale a lieu quoi qu'il arrive */
  }
  await prisma.integrationAccount.update({ where: { id: acc.id }, data: { status: "revoked", accessTokenEnc: null, refreshTokenEnc: null } });
}
