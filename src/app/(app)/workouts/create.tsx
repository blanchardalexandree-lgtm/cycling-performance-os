"use client";
import { useState, useTransition } from "react";
import { changeWorkouts } from "../actions";

export function CreateFromTemplate({ templateId, defaultMin }: { templateId: string; defaultMin: number }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [min, setMin] = useState(defaultMin);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex flex-wrap items-end gap-2">
        <input aria-label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input w-auto flex-1 py-1 text-xs" />
        <input aria-label="Durée en minutes" type="number" min={15} max={420} value={min} onChange={(e) => setMin(Number(e.target.value))} className="input w-20 py-1 text-xs" />
        <button disabled={pending} className="btn-ghost px-2.5 py-1 text-xs" onClick={() => start(async () => {
          const r = await changeWorkouts([{ op: "create", date, templateId, durationMin: min }]);
          setMsg(r.ok ? "Ajoutée au calendrier." : (r.issues ?? []).join(" "));
        })}>Planifier</button>
      </div>
      {msg && <p className="mt-1 text-xs text-ink-2">{msg}</p>}
    </div>
  );
}
