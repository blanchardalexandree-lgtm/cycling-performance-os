import type { DataOrigin } from "@prisma/client";
import { ORIGIN_LABEL } from "@/lib/references";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, action, children, className = "" }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card card-pad ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="label">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, unit, hint, origin }: { label: string; value: React.ReactNode; unit?: string; hint?: React.ReactNode; origin?: DataOrigin | null }) {
  return (
    <div className="min-w-0">
      <div className="label flex items-center gap-1.5">
        {label}
        {origin && <OriginBadge origin={origin} />}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="num text-2xl font-medium">{value}</span>
        {unit && <span className="text-sm text-ink-3">{unit}</span>}
      </div>
      {hint && <div className="mt-0.5 text-xs text-ink-3">{hint}</div>}
    </div>
  );
}

const ORIGIN_STYLE: Record<DataOrigin, string> = {
  MEASURED: "border-good/40 text-good",
  DECLARED: "border-s1/40 text-s1",
  ESTIMATED: "border-warn/40 text-warn",
  ASSUMED: "border-line-strong text-ink-3",
};

export function OriginBadge({ origin }: { origin: DataOrigin }) {
  return <span className={`rounded border px-1 py-px text-[10px] font-medium normal-case tracking-normal ${ORIGIN_STYLE[origin]}`}>{ORIGIN_LABEL[origin]}</span>;
}

export function Dot({ color }: { color: string }) {
  return <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line-strong p-4 text-sm text-ink-3">{children}</div>;
}

export function StatusPill({ level }: { level: "green" | "amber" | "red" | "stop" }) {
  const m = { green: ["Feu vert", "bg-good/15 text-good", "●"], amber: ["Prudence", "bg-warn/15 text-warn", "▲"], red: ["Alléger", "bg-bad/15 text-bad", "■"], stop: ["Repos", "bg-bad/20 text-bad", "✕"] }[level];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${m[1]}`}>
      <span aria-hidden>{m[2]}</span>
      {m[0]}
    </span>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "bad"; children: React.ReactNode }) {
  const c = { info: "border-s1/30 bg-s1/5", warn: "border-warn/30 bg-warn/5", bad: "border-bad/30 bg-bad/5" }[tone];
  return <div className={`rounded-lg border px-3 py-2 text-sm text-ink-2 ${c}`}>{children}</div>;
}
