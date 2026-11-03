/** Protection CSRF des routes API : l'en-tête Origin doit correspondre à l'hôte de l'application. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const o = new URL(origin);
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    const app = process.env.APP_URL ? new URL(process.env.APP_URL).host : null;
    return o.host === host || o.host === app;
  } catch {
    return false;
  }
}
