import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { parseActivityFile, ImportError } from "@/lib/import";
import { ingestActivity } from "@/lib/activities/ingest";
import { rateLimit } from "@/lib/rate-limit";
import { sameOrigin } from "@/lib/http";

export const runtime = "nodejs";
const MAX_BYTES = 40 * 1024 * 1024;
const MAX_FILES = 50;

/** Import multi-fichiers .fit/.gpx/.tcx. Chaque fichier est traité indépendamment. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
  if (!rateLimit(`import:${user.id}`, 30, 15 * 60_000)) return NextResponse.json({ error: "Trop d'imports rapprochés" }, { status: 429 });
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File).slice(0, MAX_FILES);
  if (!files.length) return NextResponse.json({ error: "Aucun fichier" }, { status: 400 });
  const results = [];
  for (const f of files) {
    try {
      if (f.size > MAX_BYTES) throw new ImportError("Fichier trop volumineux (40 Mo max).");
      const buf = Buffer.from(await f.arrayBuffer());
      const { kind, parsed, hash } = parseActivityFile(f.name, buf);
      const r = await ingestActivity({ userId: user.id, source: kind, externalId: hash, parsed, raw: { filename: f.name.slice(0, 200), device: parsed.device ?? null } });
      results.push({ file: f.name, ...r });
    } catch (e) {
      results.push({ file: f.name, status: "error", reason: e instanceof ImportError ? e.message : "Fichier illisible ou corrompu." });
      if (!(e instanceof ImportError)) console.error("import error", f.name, e instanceof Error ? e.message : "");
    }
  }
  return NextResponse.json({ results });
}
