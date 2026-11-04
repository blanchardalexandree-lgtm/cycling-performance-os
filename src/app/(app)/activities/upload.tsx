"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type R = { file: string; status: string; reason?: string; activityId?: string };
const LABEL: Record<string, [string, string]> = {
  created: ["importée", "text-good"], merged: ["fusionnée avec une activité existante", "text-s1"], duplicate: ["déjà importée", "text-ink-3"], ignored: ["ignorée", "text-ink-3"], error: ["erreur", "text-bad"],
};

export function Upload() {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<R[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  async function send(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    // Envoi par lots de ~3,5 Mo (limite de taille des requêtes chez les hébergeurs serverless).
    const batches: File[][] = [];
    let cur: File[] = [], size = 0;
    for (const f of Array.from(files)) {
      if (cur.length && size + f.size > 3.5e6) { batches.push(cur); cur = []; size = 0; }
      cur.push(f); size += f.size;
    }
    if (cur.length) batches.push(cur);
    const all: R[] = [];
    setResults([]);
    for (const b of batches) {
      const fd = new FormData();
      for (const f of b) fd.append("files", f);
      const res = await fetch("/api/activities/import", { method: "POST", body: fd }).catch(() => null);
      const j = res ? await res.json().catch(() => ({ error: res.status === 413 ? "Fichier trop volumineux pour l'hébergeur" : "Réponse invalide" })) : { error: "Réseau indisponible" };
      all.push(...(j.results ?? b.map((f) => ({ file: f.name, status: "error", reason: j.error }))));
      setResults([...all]);
    }
    setBusy(false);
    router.refresh();
  }
  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); send(e.dataTransfer.files); }}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-center transition-colors ${over ? "border-accent bg-accent/5" : "border-line-strong"}`}
      >
        <p className="text-sm text-ink-2">Glisse tes fichiers <b>.fit</b>, <b>.gpx</b> ou <b>.tcx</b> ici</p>
        <p className="text-xs text-ink-3">Export Garmin Connect, copie du compteur, téléchargement Nolio ou Strava (fichier original). Les doublons multi-sources sont fusionnés.</p>
        <button disabled={busy} onClick={() => input.current?.click()} className="btn-primary mt-1">{busy ? "Analyse en cours…" : "Choisir des fichiers"}</button>
        <input ref={input} type="file" multiple accept=".fit,.gpx,.tcx" className="hidden" onChange={(e) => send(e.target.files)} />
      </div>
      {results.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {results.map((r, i) => (
            <li key={i} className="flex flex-wrap gap-2">
              <span className="truncate text-ink-2">{r.file}</span>
              <span className={LABEL[r.status]?.[1]}>{LABEL[r.status]?.[0] ?? r.status}</span>
              {r.reason && <span className="text-ink-3">— {r.reason}</span>}
              {r.activityId && <a className="text-accent" href={`/activities/${r.activityId}`}>voir</a>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
