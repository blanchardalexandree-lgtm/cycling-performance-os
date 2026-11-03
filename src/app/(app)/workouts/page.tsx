import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, Dot, PageHeader } from "@/components/ui";
import { WorkoutProfile } from "@/components/workout-profile";
import { TEMPLATES, buildWorkout } from "@/lib/planning/library";
import { estimateTss, totalDurationS } from "@/lib/planning/types";
import { catStyle, fmtDay } from "@/lib/format";
import { iso } from "@/lib/planning/cycle";
import { CreateFromTemplate } from "./create";

export const dynamic = "force-dynamic";

export default async function Workouts() {
  const user = await requireUser();
  const recent = await prisma.plannedWorkout.findMany({ where: { userId: user.id, date: { lte: new Date() } }, orderBy: { date: "desc" }, take: 15 });
  return (
    <>
      <PageHeader title="Séances" subtitle="Bibliothèque structurée : chaque modèle s'adapte au temps disponible en conservant son objectif physiologique." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {TEMPLATES.map((t) => {
          const w = buildWorkout(t.id, t.idealMin)!;
          const c = catStyle(t.category);
          return (
            <Card key={t.id}>
              <div className="flex items-center gap-2"><Dot color={c.color} /><h3 className="font-semibold">{t.title}</h3>{t.key && <span className="chip ml-auto border-accent/40 text-accent">clé</span>}</div>
              <p className="mt-1 text-sm text-ink-3">{t.objective}</p>
              <div className="mt-3"><WorkoutProfile blocks={w.blocks} height={40} /></div>
              <div className="mt-2 flex gap-4 text-xs text-ink-2"><span>{t.minMin}-{t.maxMin} min</span><span>Idéal {Math.round(totalDurationS(w.blocks) / 60)} min · TSS ≈ {estimateTss(w.blocks)}</span></div>
              <CreateFromTemplate templateId={t.id} defaultMin={t.idealMin} />
            </Card>
          );
        })}
      </div>
      <Card title="Historique récent" className="mt-4">
        <ul className="divide-y divide-line text-sm">
          {recent.map((w) => (
            <li key={w.id} className="flex items-center gap-3 py-2">
              <span className="w-28 shrink-0 text-ink-3">{fmtDay(w.date)}</span>
              <Link href={`/workouts/${w.id}`} className="truncate hover:text-accent">{w.title}</Link>
              <span className="ml-auto text-xs text-ink-3">{w.status === "COMPLETED" ? "réalisée" : w.status === "PARTIAL" ? "partielle" : w.status === "MISSED" ? "manquée" : "prévue"}</span>
            </li>
          ))}
          {!recent.length && <li className="py-2 text-ink-3">Aucune séance passée. Aujourd'hui : {iso(new Date())}.</li>}
        </ul>
      </Card>
    </>
  );
}
