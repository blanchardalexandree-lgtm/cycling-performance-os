import Link from "next/link";
import type { PlannedWorkout } from "@prisma/client";
import { catStyle, fmtDay, fmtNum } from "@/lib/format";
import type { Block } from "@/lib/planning/types";
import { WorkoutProfile } from "./workout-profile";
import { Dot } from "./ui";

const ROLE: Record<string, string> = { TRAINING: "Entraînement", ACTIVE_RECOVERY: "Récupération active", RACE: "Course", TEST: "Test", OFF: "Sans vélo" };
const STATUS: Record<string, [string, string]> = {
  PLANNED: ["Prévue", "text-ink-3"], COMPLETED: ["Réalisée", "text-good"], PARTIAL: ["Partielle", "text-warn"], MISSED: ["Manquée", "text-bad"], SKIPPED: ["Annulée", "text-ink-3"],
};

export function WorkoutCard({ w, label, refWatts }: { w: PlannedWorkout | null; label: string; refWatts: number | null }) {
  if (!w) {
    return (
      <div className="card card-pad">
        <div className="label">{label}</div>
        <p className="mt-3 text-sm text-ink-3">Aucune séance planifiée. <Link href="/calendar" className="text-accent">Générer le plan</Link></p>
      </div>
    );
  }
  const c = catStyle(w.category);
  const steps = w.steps as unknown as { blocks: Block[] };
  const [st, stc] = STATUS[w.status];
  return (
    <Link href={`/workouts/${w.id}`} className="card card-pad block transition-colors hover:border-line-strong">
      <div className="flex items-center justify-between gap-2">
        <div className="label">{label} · {fmtDay(w.date)}</div>
        <span className={`text-xs ${stc}`}>{st}</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Dot color={c.color} />
        <h3 className="truncate text-base font-semibold">{w.title}</h3>
        {w.priority === 1 && <span className="chip border-accent/40 text-accent">clé</span>}
      </div>
      <p className="mt-1 line-clamp-2 text-sm text-ink-3">{w.objective}</p>
      <div className="mt-3"><WorkoutProfile blocks={steps.blocks} refWatts={refWatts} height={44} /></div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        <span><span className="num">{w.durationMin}</span> min</span>
        <span>TSS prévu <span className="num">{fmtNum(w.plannedTss)}</span></span>
        <span>{ROLE[w.dayRole]}{w.cycleIndex ? ` · jour ${w.cycleIndex}/4` : ""}</span>
        {w.indoor && <span>Home trainer</span>}
      </div>
    </Link>
  );
}
