import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toFitWorkout, toMrc, toZwo } from "@/lib/planning/export";
import { getReferences, powerReference } from "@/lib/references";
import type { Block } from "@/lib/planning/types";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { id } = await params;
  const w = await prisma.plannedWorkout.findFirst({ where: { id, userId: user.id } });
  if (!w) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const format = new URL(req.url).searchParams.get("format") ?? "zwo";
  const blocks = (w.steps as unknown as { blocks: Block[] }).blocks;
  const base = `${w.date.toISOString().slice(0, 10)}_${w.title}`.normalize("NFD").replace(/[^\w-]+/g, "_").slice(0, 60);
  if (format === "zwo") {
    return new NextResponse(toZwo(w.title, w.objective, blocks), { headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.zwo"` } });
  }
  if (format === "mrc") {
    return new NextResponse(toMrc(w.title, w.objective, blocks), { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.mrc"` } });
  }
  if (format === "fit") {
    const pref = powerReference(await getReferences(user.id));
    const bytes = toFitWorkout(w.title, blocks, pref?.watts ?? null);
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/vnd.ant.fit", "Content-Disposition": `attachment; filename="${base}.fit"` } });
  }
  return NextResponse.json({ error: "Format inconnu (zwo, mrc, fit)" }, { status: 400 });
}
