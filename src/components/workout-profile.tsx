import type { Block } from "@/lib/planning/types";
import { flatten } from "@/lib/planning/types";

/** Profil d'intensité d'une séance (SVG statique, aucune dépendance client). */
export function WorkoutProfile({ blocks, height = 56, refWatts }: { blocks: Block[]; height?: number; refWatts?: number | null }) {
  const steps = flatten(blocks);
  const total = steps.reduce((s, x) => s + x.durationS, 0) || 1;
  const maxI = Math.max(1.3, ...steps.map((s) => Math.min(s.high, 2)));
  let x = 0;
  const color = (i: number) => (i < 0.56 ? "var(--color-k-recup)" : i < 0.76 ? "var(--color-k-endurance)" : i < 0.88 ? "var(--color-k-tempo)" : i < 1.06 ? "var(--color-k-seuil)" : i < 1.21 ? "var(--color-k-vo2)" : "var(--color-k-anaerobie)");
  return (
    <svg viewBox={`0 0 1000 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img" aria-label="Profil d'intensité de la séance">
      {steps.map((s, i) => {
        const w = (s.durationS / total) * 1000;
        const mid = Math.min((s.low + s.high) / 2, 2);
        const h = Math.max(3, (mid / maxI) * (height - 2));
        const r = <rect key={i} x={x + 0.5} y={height - h} width={Math.max(w - 1, 1)} height={h} rx={1.5} fill={color(mid)}><title>{`${Math.round(s.durationS / 60)} min · ${s.kind === "sprint" ? "sprint" : `${Math.round(s.low * 100)}-${Math.round(s.high * 100)} %`}${refWatts && s.kind !== "sprint" ? ` (${Math.round(s.low * refWatts)}-${Math.round(s.high * refWatts)} W)` : ""}`}</title></rect>;
        x += w;
        return r;
      })}
      <line x1="0" x2="1000" y1={height - (1 / maxI) * (height - 2)} y2={height - (1 / maxI) * (height - 2)} stroke="var(--color-ink-3)" strokeDasharray="4 4" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.5" />
    </svg>
  );
}
