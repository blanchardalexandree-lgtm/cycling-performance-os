"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { coachAsk } from "../actions";

type Msg = { role: "user" | "assistant"; content: string; tools?: string[] };

const SUGGESTIONS = [
  "Prépare-moi pour mon championnat de France du contre-la-montre.",
  "Comment dois-je organiser les quatre prochaines semaines ?",
  "Ma séance d'aujourd'hui est-elle adaptée à ma fatigue ?",
  "Analyse ma dernière course et identifie mes axes de progression.",
  "Je n'ai pas pu réaliser la séance prévue : comment adapter la suite ?",
  "Quel est mon niveau actuel sur 20 et 40 minutes ?",
];

/** Rendu Markdown minimal et sûr (gras, listes, paragraphes) — aucun HTML injecté. */
function Rich({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      {text.split(/\n{2,}/).map((para, i) => {
        const lines = para.split("\n");
        const isList = lines.every((l) => /^\s*[-•*]\s/.test(l) || !l.trim());
        const fmt = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((part, j) => (part.startsWith("**") ? <strong key={j}>{part.slice(2, -2)}</strong> : <span key={j}>{part}</span>));
        return isList ? <ul key={i} className="list-disc space-y-0.5 pl-5">{lines.filter((l) => l.trim()).map((l, j) => <li key={j}>{fmt(l.replace(/^\s*[-•*]\s/, ""))}</li>)}</ul> : <p key={i} className="whitespace-pre-line">{fmt(para)}</p>;
      })}
    </div>
  );
}

export function CoachChat({ initial, live }: { initial: Msg[]; live: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, pending]);
  const send = (text: string) => {
    if (!text.trim()) return;
    setMsgs((m) => [...m, { role: "user", content: text }]);
    setQ("");
    start(async () => {
      const r = await coachAsk(text);
      setMsgs((m) => [...m, "error" in r ? { role: "assistant", content: `⚠ ${r.error}` } : { role: "assistant", content: r.text, tools: r.toolsUsed }]);
    });
  };
  return (
    <div className="card flex h-[calc(100dvh-260px)] min-h-[420px] flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {msgs.length === 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)} className="rounded-lg border border-line p-3 text-left text-sm text-ink-2 hover:border-line-strong hover:text-ink">{s}</button>)}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${m.role === "user" ? "bg-accent/15 text-ink" : "bg-surface-2 text-ink"}`}>
              {m.role === "assistant" ? <Rich text={m.content} /> : m.content}
              {m.tools && m.tools.length > 0 && <div className="mt-2 text-[11px] text-ink-3">Données consultées : {[...new Set(m.tools)].join(", ")}</div>}
            </div>
          </div>
        ))}
        {pending && <div className="text-sm text-ink-3">{live ? "Le coach analyse tes données…" : "Calcul…"}</div>}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(q); }} className="flex gap-2 border-t border-line p-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pose ta question…" className="input flex-1" maxLength={2000} aria-label="Question au coach" />
        <button disabled={pending || !q.trim()} className="btn-primary">Envoyer</button>
      </form>
    </div>
  );
}
