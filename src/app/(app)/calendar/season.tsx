import type { CalItem } from "./board";
import { diffDays } from "@/lib/planning/cycle";
import { catStyle } from "@/lib/format";

const PHASE_COLOR: Record<string, string> = {
  general: "#24497a", development: "#3172c9", specific: "#9085e9", competition: "#c98500", taper: "#c8f03c", transition: "#4b5563",
};

/** Timeline de saison : phases, objectifs A/B/C, séances clés, tests, récupérations. */
export function SeasonTimeline({ from, to, phases, items }: { from: string; to: string; phases: { kind: string; name: string; start: string; end: string }[]; items: CalItem[] }) {
  const total = diffDays(to, from) + 1;
  const x = (d: string) => `${(Math.max(0, diffDays(d, from)) / total) * 100}%`;
  const w = (a: string, b: string) => `${((diffDays(b, a) + 1) / total) * 100}%`;
  const months: string[] = [];
  for (let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7)); `${y}-${String(m).padStart(2, "0")}` <= to.slice(0, 7); m === 12 ? (y++, (m = 1)) : m++) months.push(`${y}-${String(m).padStart(2, "0")}-01`);
  const goals = items.filter((i): i is Extract<CalItem, { kind: "goal" }> => i.kind === "goal");
  const uniqueGoals = [...new Map(goals.map((g) => [g.id, g])).values()];
  const keyW = items.filter((i): i is Extract<CalItem, { kind: "workout" }> => i.kind === "workout" && (i.priority === 1 || i.role === "TEST"));
  const recov = items.filter((i): i is Extract<CalItem, { kind: "workout" }> => i.kind === "workout" && i.role === "ACTIVE_RECOVERY");
  const lane = "relative h-8 border-b border-line";
  return (
    <div className="card card-pad overflow-x-auto">
      <div className="min-w-[900px]">
        <Row label="">
          <div className="relative h-6 border-b border-line">
            {months.map((m) => m >= from && <span key={m} className="absolute top-0 border-l border-line pl-1 text-[11px] capitalize text-ink-3" style={{ left: x(m) }}>{new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" }).format(new Date(m))}</span>)}
          </div>
        </Row>
        <Row label="Phases">
          <div className={lane}>
            {phases.map((p) => (
              <div key={p.start} className="absolute top-1 h-6 overflow-hidden rounded px-1.5 text-[10px] leading-6 text-white/90" style={{ left: x(p.start), width: w(p.start, p.end), background: PHASE_COLOR[p.kind] ?? "#333" }} title={`${p.name} · ${p.start} → ${p.end}`}>{diffDays(p.end, p.start) >= 20 ? p.name : ""}</div>
            ))}
            {!phases.length && <span className="text-xs text-ink-3">Génère le plan pour voir la périodisation.</span>}
          </div>
        </Row>
        {(["A", "B", "C"] as const).map((pr) => (
          <Row key={pr} label={`Objectifs ${pr}`}>
            <div className={lane}>
              {uniqueGoals.filter((g) => g.priority === pr && g.goalKind !== "stage").map((g) => (
                <div key={g.id} className="absolute top-1.5 flex items-center" aria-label={g.title} style={{ left: x(g.date) }} title={`${g.title} · ${g.date}`}>
                  <span className={`h-5 w-1.5 rounded-sm ${pr === "A" ? "bg-accent" : pr === "B" ? "bg-ink-2" : "bg-ink-3"}`} />
                  {pr === "A" && !uniqueGoals.some((o) => o.priority === "A" && o.goalKind !== "stage" && o.id !== g.id && o.date < g.date && diffDays(g.date, o.date) <= 7) && <span className="ml-1 whitespace-nowrap text-[10px] text-ink-2">{g.title}</span>}
                </div>
              ))}
            </div>
          </Row>
        ))}
        <Row label="Stages">
          <div className={lane}>
            {uniqueGoals.filter((g) => g.goalKind === "stage").map((g) => <div key={g.id} className="absolute top-2 h-4 w-1.5 rounded-sm bg-s7" style={{ left: x(g.date) }} title={g.title} />)}
          </div>
        </Row>
        <Row label="Séances clés">
          <div className={lane}>
            {keyW.map((k) => <div key={k.id} className="absolute top-2 h-4 w-[3px] rounded-sm" style={{ left: x(k.date), background: catStyle(k.category).color }} title={`${k.date} · ${k.title}`} />)}
          </div>
        </Row>
        <Row label="Récup. active">
          <div className={lane}>
            {recov.map((k) => <div key={k.id} className="absolute top-3 h-2 w-[3px] rounded-sm bg-k-recup" style={{ left: x(k.date) }} title={`${k.date} · récupération active`} />)}
          </div>
        </Row>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-3">
          {Object.entries(PHASE_COLOR).map(([k, c]) => <span key={k} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />{({ general: "Général", development: "Développement", specific: "Spécialisation", competition: "Compétition", taper: "Affûtage", transition: "Transition" } as Record<string, string>)[k]}</span>)}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center">
      <span className="label pr-2">{label}</span>
      {children}
    </div>
  );
}
