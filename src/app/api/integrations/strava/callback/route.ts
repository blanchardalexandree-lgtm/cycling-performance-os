import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { exchangeCode, syncStrava, StravaError } from "@/lib/integrations/strava";

export const maxDuration = 60;

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  const url = new URL(req.url);
  const jar = await cookies();
  const expected = jar.get("strava_oauth_state")?.value;
  jar.delete("strava_oauth_state");
  if (url.searchParams.get("error")) return NextResponse.redirect(new URL("/integrations?error=strava_denied", req.url));
  if (!expected || url.searchParams.get("state") !== expected) return NextResponse.redirect(new URL("/integrations?error=strava_state", req.url));
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/integrations?error=strava_code", req.url));
  try {
    await exchangeCode(user.id, code, url.searchParams.get("scope") ?? "");
    // Première synchro limitée pour rester rapide ; la suite via « Synchroniser maintenant ».
    await syncStrava(user.id, { historyDays: 90 }).catch(() => undefined);
    return NextResponse.redirect(new URL("/integrations?connected=strava", req.url));
  } catch (e) {
    const msg = e instanceof StravaError ? e.message : "Erreur de connexion Strava";
    return NextResponse.redirect(new URL(`/integrations?error=${encodeURIComponent(msg)}`, req.url));
  }
}
