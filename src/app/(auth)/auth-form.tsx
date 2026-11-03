"use client";
import Link from "next/link";
import { useActionState } from "react";
import { login, register, type AuthState } from "./actions";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "login" ? login : register, undefined);
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-accent text-sm font-bold text-accent-ink">CP</span>
          <span className="font-semibold tracking-tight">Cycling Performance OS</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{mode === "login" ? "Connexion" : "Créer le compte"}</h1>
        <p className="mt-1 text-sm text-ink-3">{mode === "login" ? "Ton directeur de performance personnel." : "Les données restent privées et isolées par compte."}</p>
        <form action={action} className="mt-6 space-y-3">
          {mode === "register" && (
            <label className="block">
              <span className="label">Prénom</span>
              <input name="name" required className="input mt-1" autoComplete="given-name" />
            </label>
          )}
          <label className="block">
            <span className="label">Email</span>
            <input name="email" type="email" required className="input mt-1" autoComplete="email" />
          </label>
          <label className="block">
            <span className="label">Mot de passe</span>
            <input name="password" type="password" required minLength={mode === "register" ? 10 : 1} className="input mt-1" autoComplete={mode === "login" ? "current-password" : "new-password"} />
          </label>
          {state?.error && <p role="alert" className="text-sm text-bad">{state.error}</p>}
          <button disabled={pending} className="btn-primary w-full">{pending ? "…" : mode === "login" ? "Se connecter" : "Créer mon compte"}</button>
        </form>
        <p className="mt-4 text-sm text-ink-3">
          {mode === "login" ? <>Pas de compte ? <Link className="text-accent" href="/register">Créer un compte</Link></> : <>Déjà inscrit ? <Link className="text-accent" href="/login">Se connecter</Link></>}
        </p>
      </div>
    </div>
  );
}
