"use client";
import { useState, useTransition } from "react";
import { garminKeyAction } from "../actions";

export function GarminKeyForm() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; message?: string } | null>(null);
  return (
    <form action={(fd) => start(async () => setMsg(await garminKeyAction(fd)))} className="flex flex-col gap-2">
      <label><span className="label">Clé Personal API Garmin</span><input name="apiKey" type="password" autoComplete="off" required className="input mt-1" placeholder="Collée depuis Garmin Connect → Paramètres" /></label>
      <div><button disabled={pending} className="btn-ghost">{pending ? "Test…" : "Enregistrer et tester"}</button></div>
      {msg && <span className={`text-xs ${msg.ok ? "text-good" : "text-bad"}`}>{msg.message}</span>}
      <span className="text-[11px] text-ink-3">La clé est chiffrée (AES-256-GCM) côté serveur et n'est jamais renvoyée au navigateur.</span>
    </form>
  );
}
