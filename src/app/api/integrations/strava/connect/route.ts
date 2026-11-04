import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { buildAuthorizeUrl, stravaConfigured } from "@/lib/integrations/strava";

/** Démarre l'OAuth Strava avec un paramètre state anti-CSRF (cookie httpOnly, 10 min). */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  if (!stravaConfigured()) return NextResponse.redirect(new URL("/integrations?error=strava_not_configured", req.url));
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set("strava_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" });
  // L'adresse de retour suit l'adresse réellement utilisée (évite un APP_URL mal renseigné).
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  return NextResponse.redirect(buildAuthorizeUrl(state, host ? `${proto}://${host}` : undefined));
}
