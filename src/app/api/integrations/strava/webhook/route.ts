import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { syncStrava } from "@/lib/integrations/strava";

/**
 * Webhook Strava (https://developers.strava.com/docs/webhooks/).
 * GET : validation de l'abonnement (hub.challenge). POST : événements.
 *  - activity create → import de cette activité ; athlete update authorized=false → révocation.
 * Strava exige une réponse 200 en moins de 2 s : le traitement est lancé sans être attendu.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("hub.mode") === "subscribe" && process.env.STRAVA_WEBHOOK_VERIFY_TOKEN && u.searchParams.get("hub.verify_token") === process.env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
    return NextResponse.json({ "hub.challenge": u.searchParams.get("hub.challenge") });
  }
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

export async function POST(req: Request) {
  const ev = (await req.json().catch(() => null)) as { object_type?: string; aspect_type?: string; object_id?: number; owner_id?: number; subscription_id?: number; updates?: Record<string, string> } | null;
  if (!ev?.owner_id) return NextResponse.json({ ok: true });
  if (process.env.STRAVA_SUBSCRIPTION_ID && String(ev.subscription_id) !== process.env.STRAVA_SUBSCRIPTION_ID) return NextResponse.json({ ok: true });
  const acc = await prisma.integrationAccount.findFirst({ where: { provider: "strava", externalUserId: String(ev.owner_id) } });
  if (!acc) return NextResponse.json({ ok: true });
  if (ev.object_type === "athlete" && ev.updates?.authorized === "false") {
    await prisma.integrationAccount.update({ where: { id: acc.id }, data: { status: "revoked", accessTokenEnc: null, refreshTokenEnc: null, lastError: "Accès révoqué depuis Strava." } });
  } else if (ev.object_type === "activity" && ev.aspect_type === "create" && ev.object_id && acc.status === "connected") {
    void syncStrava(acc.userId, { onlyActivityId: ev.object_id }).catch(() => undefined);
  } else if (ev.object_type === "activity" && ev.aspect_type === "delete" && ev.object_id) {
    await prisma.activitySourceRecord.deleteMany({ where: { userId: acc.userId, source: "STRAVA", externalId: String(ev.object_id) } });
    await prisma.activity.deleteMany({ where: { userId: acc.userId, sources: { none: {} } } });
  }
  return NextResponse.json({ ok: true });
}
