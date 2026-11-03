"use client";
import { useState, useTransition } from "react";
import { decideProposal, type ActionResult } from "@/app/(app)/actions";

/** Bouton qui appelle une action serveur et affiche son résultat. */
export function RunButton({ action, label, className = "btn-ghost", confirm }: { action: () => Promise<ActionResult | void>; label: string; className?: string; confirm?: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionResult | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        className={className}
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => {
            const r = await action();
            if (r) setMsg(r);
          });
        }}
      >
        {pending ? "…" : label}
      </button>
      {msg?.message && <span className={`text-xs ${msg.ok ? "text-good" : "text-bad"}`}>{msg.message}</span>}
      {msg?.issues?.map((i) => <span key={i} className="text-xs text-warn">{i}</span>)}
    </span>
  );
}

export function ProposalActions({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ActionResult | null>(null);
  const run = (accept: boolean, force = false) => start(async () => setRes(await decideProposal(id, accept, force)));
  if (res?.ok) return <span className="text-xs text-good">Décision enregistrée.</span>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button disabled={pending} onClick={() => run(true)} className="btn-primary px-3 py-1.5 text-xs">Accepter</button>
        <button disabled={pending} onClick={() => run(false)} className="btn-ghost px-3 py-1.5 text-xs">Refuser</button>
        <a href="/calendar" className="btn-ghost px-3 py-1.5 text-xs">Modifier dans le calendrier</a>
      </div>
      {res?.issues?.length ? (
        <div className="text-xs text-warn">
          {res.issues.map((i) => <div key={i}>{i}</div>)}
          <button onClick={() => run(true, true)} className="mt-1 underline">Appliquer malgré tout</button>
        </div>
      ) : null}
      {res?.message && <span className="text-xs text-bad">{res.message}</span>}
    </div>
  );
}
