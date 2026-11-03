"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeWorkouts, duplicateWorkout, toggleLock } from "../actions";
import { catStyle } from "@/lib/format";
import { addDays } from "@/lib/planning/cycle";

export type CalItem =
  | { kind: "workout"; id: string; date: string; title: string; category: string; durationMin: number; tss: number | null; role: string; cycleIndex: number | null; status: string; locked: boolean; priority: number; pending: boolean; steps: object; actualActivityId: string | null }
  | { kind: "goal"; id: string; date: string; title: string; priority: string; goalKind: string; confirmed: boolean }
  | { kind: "constraint"; id: string; date: string; title: string; maxMin: number | null; noTraining: boolean }
  | { kind: "activity"; id: string; date: string; title: string; durationMin: number; tss: number | null; isRace: boolean };

const WD = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const STATUS_MARK: Record<string, string> = { COMPLETED: "✓", PARTIAL: "◐", MISSED: "✕", SKIPPED: "–", PLANNED: "" };

export function CalendarBoard({ view, from, to, anchorMonth, items, today, phases }: { view: "day" | "week" | "month"; from: string; to: string; anchorMonth: string; items: CalItem[]; today: string; refWatts: number | null; phases: { kind: string; name: string; start: string; end: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [issues, setIssues] = useState<{ list: string[]; retry: () => void } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const days = useMemo(() => {
    const out: string[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
    return out;
  }, [from, to]);
  const byDay = useMemo(() => {
    const m = new Map<string, CalItem[]>();
    for (const i of items) m.set(i.date, [...(m.get(i.date) ?? []), i]);
    return m;
  }, [items]);

  const move = (id: string, toDate: string, force = false) =>
    start(async () => {
      const r = await changeWorkouts([{ op: "move", workoutId: id, toDate }], force);
      if (!r.ok && r.issues?.length) setIssues({ list: r.issues, retry: () => { setIssues(null); move(id, toDate, true); } });
      else { setIssues(null); router.refresh(); }
    });

  const sel = items.find((i) => i.kind === "workout" && i.id === selected) as Extract<CalItem, { kind: "workout" }> | undefined;

  const phaseOf = (d: string) => phases.find((p) => d >= p.start && d <= p.end);

  const cell = (d: string, tall: boolean) => {
    const list = byDay.get(d) ?? [];
    const inMonth = view !== "month" || d.startsWith(anchorMonth);
    const ph = phaseOf(d);
    return (
      <div
        key={d}
        onDragOver={(e) => { e.preventDefault(); setDragOver(d); }}
        onDragLeave={() => setDragOver((x) => (x === d ? null : x))}
        onDrop={(e) => { e.preventDefault(); setDragOver(null); const id = e.dataTransfer.getData("text/workout"); if (id) move(id, d); }}
        className={`group relative flex min-w-0 flex-col gap-1 border-b border-r border-line p-1.5 ${tall ? "min-h-[180px]" : "min-h-[104px]"} ${inMonth ? "" : "opacity-40"} ${dragOver === d ? "bg-accent/10" : ""}`}
      >
        <div className="flex items-center justify-between">
          <span className={`num text-[11px] ${d === today ? "rounded bg-accent px-1 font-semibold text-accent-ink" : "text-ink-3"}`}>{Number(d.slice(8))}</span>
          {ph && view !== "month" && <span className="truncate text-[10px] text-ink-3">{ph.name}</span>}
        </div>
        {list.filter((i) => i.kind === "goal").map((g) => g.kind === "goal" && (
          <div key={g.id + d} className={`truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${g.goalKind === "stage" ? "bg-s7/15 text-s7" : "bg-accent/15 text-accent"}`} title={g.title}>
            {g.goalKind === "stage" ? "Stage · " : `${g.priority} · `}{g.title}{!g.confirmed && " (?)"}
          </div>
        ))}
        {list.filter((i) => i.kind === "constraint").map((c) => c.kind === "constraint" && (
          <div key={c.id + d} className="truncate rounded border border-dashed border-line-strong px-1.5 py-0.5 text-[10px] text-ink-3" title={c.title}>
            {c.title}{c.noTraining ? " · sans vélo" : c.maxMin != null ? ` · ≤ ${c.maxMin}′` : ""}
          </div>
        ))}
        {list.filter((i) => i.kind === "workout").map((w) => {
          if (w.kind !== "workout") return null;
          const c = catStyle(w.category);
          return (
            <button
              key={w.id}
              draggable={!w.locked && w.status === "PLANNED"}
              onDragStart={(e) => e.dataTransfer.setData("text/workout", w.id)}
              onClick={() => setSelected(w.id)}
              className={`w-full rounded-md border-l-[3px] bg-surface-2 px-1.5 py-1 text-left text-[11px] leading-tight transition-colors hover:bg-line ${w.pending ? "ring-1 ring-warn/60" : ""} ${selected === w.id ? "ring-1 ring-accent" : ""}`}
              style={{ borderLeftColor: c.color }}
              aria-label={`${w.title}, ${w.durationMin} minutes`}
            >
              <div className="flex items-center gap-1">
                <span className="truncate font-medium">{w.title}</span>
                {w.locked && <span aria-label="verrouillée" title="Validée (verrouillée)">🔒</span>}
                <span className="ml-auto shrink-0 text-ink-3">{STATUS_MARK[w.status]}</span>
              </div>
              <div className="num mt-0.5 text-ink-3">{w.durationMin}′{w.tss ? ` · ${Math.round(w.tss)}` : ""}{w.cycleIndex ? ` · J${w.cycleIndex}` : ""}</div>
            </button>
          );
        })}
        {list.filter((i) => i.kind === "activity").map((a) => a.kind === "activity" && (
          <Link key={a.id} href={`/activities/${a.id}`} className="truncate rounded px-1.5 py-0.5 text-[10px] text-good hover:underline" title={a.title}>
            ✓ {a.title} · {a.durationMin}′{a.tss ? ` · ${Math.round(a.tss)}` : ""}
          </Link>
        ))}
      </div>
    );
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <div className="min-w-0">
        {issues && (
          <div role="alert" className="mb-3 rounded-lg border border-warn/40 bg-warn/5 p-3 text-sm">
            <div className="font-medium text-warn">Déplacement non appliqué : règle de cohérence</div>
            <ul className="mt-1 list-disc pl-5 text-ink-2">{issues.list.map((i) => <li key={i}>{i}</li>)}</ul>
            <div className="mt-2 flex gap-2"><button className="btn-ghost px-2 py-1 text-xs" onClick={issues.retry}>Appliquer malgré tout</button><button className="btn-ghost px-2 py-1 text-xs" onClick={() => setIssues(null)}>Annuler</button></div>
          </div>
        )}
        {pending && <div className="mb-2 text-xs text-ink-3">Mise à jour…</div>}
        {view === "day" ? (
          <div className="card">{cell(from, true)}</div>
        ) : (
          <div className="card overflow-x-auto">
            <div className={`grid min-w-[720px] grid-cols-7 border-l border-t border-line`}>
              {WD.map((w) => <div key={w} className="label border-b border-r border-line px-2 py-1.5">{w}</div>)}
              {days.map((d) => cell(d, view === "week"))}
            </div>
          </div>
        )}
        <Legend />
      </div>
      <aside className="card card-pad h-fit xl:sticky xl:top-6">
        {sel ? <Detail w={sel} onDone={() => router.refresh()} /> : <p className="text-sm text-ink-3">Sélectionne une séance pour la consulter, la dupliquer, la verrouiller ou la comparer à sa réalisation.</p>}
      </aside>
    </div>
  );
}

function Detail({ w, onDone }: { w: Extract<CalItem, { kind: "workout" }>; onDone: () => void }) {
  const [dupDate, setDupDate] = useState(w.date);
  const [dur, setDur] = useState(w.durationMin);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; issues?: string[]; message?: string } | void>) =>
    start(async () => {
      const r = await fn();
      setMsg(r && !r.ok ? (r.issues ?? [r.message]).join(" ") : "Enregistré.");
      onDone();
    });
  const c = catStyle(w.category);
  return (
    <div className="space-y-3 text-sm">
      <div>
        <div className="label" style={{ color: c.color }}>{c.label}</div>
        <h3 className="mt-1 text-base font-semibold">{w.title}</h3>
        <div className="text-xs text-ink-3">{w.date} · {w.durationMin} min · TSS {w.tss ?? "—"}</div>
        {w.pending && <div className="mt-1 text-xs text-warn">Modification proposée en attente (voir Dashboard).</div>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={`/workouts/${w.id}`} className="btn-ghost px-2.5 py-1 text-xs">Détails et export</Link>
        {w.actualActivityId && <Link href={`/activities/${w.actualActivityId}`} className="btn-ghost px-2.5 py-1 text-xs">Réalisation</Link>}
        <button disabled={pending} className="btn-ghost px-2.5 py-1 text-xs" onClick={() => run(() => toggleLock(w.id))}>{w.locked ? "Déverrouiller" : "Valider (verrouiller)"}</button>
      </div>
      {w.status === "PLANNED" && (
        <>
          <div className="flex items-end gap-2">
            <label className="flex-1"><span className="label">Durée (min)</span><input type="number" min={15} max={420} value={dur} onChange={(e) => setDur(Number(e.target.value))} className="input mt-1 py-1" /></label>
            <button disabled={pending} className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => run(() => changeWorkouts([{ op: "resize", workoutId: w.id, durationMin: dur }]))}>Ajuster</button>
          </div>
          <div className="flex items-end gap-2">
            <label className="flex-1"><span className="label">Date cible</span><input type="date" value={dupDate} onChange={(e) => setDupDate(e.target.value)} className="input mt-1 py-1" /></label>
            <button disabled={pending} className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => run(() => changeWorkouts([{ op: "move", workoutId: w.id, toDate: dupDate }]))}>Déplacer</button>
            <button disabled={pending} className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => run(() => duplicateWorkout(w.id, dupDate))}>Dupliquer</button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={pending} className="btn-ghost px-2.5 py-1 text-xs" onClick={() => run(() => changeWorkouts([{ op: "replace", workoutId: w.id, templateId: "recup_active", durationMin: 40 }]))}>Remplacer par une récupération</button>
            <button disabled={pending} className="btn-danger px-2.5 py-1 text-xs" onClick={() => { if (confirm("Supprimer cette séance ?")) run(() => changeWorkouts([{ op: "delete", workoutId: w.id }], true)); }}>Supprimer</button>
          </div>
        </>
      )}
      {msg && <p className="text-xs text-ink-2">{msg}</p>}
    </div>
  );
}

function Legend() {
  const cats = ["recuperation", "endurance", "tempo", "seuil", "vo2", "anaerobie", "clm", "test"];
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-3">
      {cats.map((c) => <span key={c} className="flex items-center gap-1.5"><span className="h-2.5 w-1 rounded-sm" style={{ background: catStyle(c).color }} />{catStyle(c).label}</span>)}
      <span>✓ réalisée · ◐ partielle · ✕ manquée · 🔒 validée · J1-J4 position dans le cycle</span>
    </div>
  );
}
