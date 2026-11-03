"use client";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, BarChart, Cell } from "recharts";

const AXIS = { stroke: "var(--color-line-strong)", tick: { fill: "var(--color-ink-3)", fontSize: 11 }, tickLine: false };
const GRID = { stroke: "var(--color-line)", strokeDasharray: "0", vertical: false };
const TOOLTIP = {
  contentStyle: { background: "var(--color-surface-2)", border: "1px solid var(--color-line-strong)", borderRadius: 8, fontSize: 12, color: "var(--color-ink)" },
  labelStyle: { color: "var(--color-ink-2)", marginBottom: 4 },
  itemStyle: { color: "var(--color-ink)", padding: 0 },
  cursor: { stroke: "var(--color-ink-3)", strokeWidth: 1 },
};
const durLabel = (s: number) => (s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}′` : `${s / 3600}h`);

/** Charge : CTL / ATL / TSB (même échelle) + TSS quotidien en barres fines. */
export function PmcChart({ data, height = 260 }: { data: { date: string; tss: number; ctl: number; atl: number; tsb: number }[]; height?: number }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="date" {...AXIS} minTickGap={40} tickFormatter={(d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} />
          <YAxis {...AXIS} width={44} />
          <Tooltip {...TOOLTIP} labelFormatter={(d) => new Date(String(d)).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 11, color: "var(--color-ink-2)" }} />
          <ReferenceLine y={0} stroke="var(--color-line-strong)" />
          <Bar isAnimationActive={false} dataKey="tss" name="TSS du jour" fill="var(--color-ink-3)" opacity={0.35} radius={[2, 2, 0, 0]} maxBarSize={6} />
          <Line isAnimationActive={false} dataKey="ctl" name="CTL (chronique)" stroke="var(--color-s1)" strokeWidth={2} dot={false} />
          <Line isAnimationActive={false} dataKey="atl" name="ATL (aiguë)" stroke="var(--color-s2)" strokeWidth={2} dot={false} />
          <Line isAnimationActive={false} dataKey="tsb" name="TSB (fraîcheur)" stroke="var(--color-s3)" strokeWidth={2} dot={false} strokeDasharray="5 3" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Courbe de puissance maximale (axe x logarithmique), jusqu'à 3 périodes comparées. */
export function PowerCurveChart({ series, height = 300 }: { series: { name: string; color: string; points: { durationS: number; watts: number }[] }[]; height?: number }) {
  const durations = [...new Set(series.flatMap((s) => s.points.map((p) => p.durationS)))].sort((a, b) => a - b);
  const data = durations.map((d) => {
    const row: Record<string, number | null> = { d };
    for (const s of series) row[s.name] = s.points.find((p) => p.durationS === d)?.watts ?? null;
    return row;
  });
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -4 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="d" type="number" scale="log" domain={["dataMin", "dataMax"]} ticks={[5, 15, 60, 300, 1200, 3600].filter((t) => durations.length && t >= durations[0] && t <= durations[durations.length - 1])} tickFormatter={durLabel} {...AXIS} />
          <YAxis {...AXIS} width={48} />
          <Tooltip {...TOOLTIP} labelFormatter={(d) => `Durée ${durLabel(Number(d))}`} formatter={(v) => (v == null ? "—" : `${Math.round(Number(v))} W`)} />
          {series.length > 1 && <Legend iconType="plainline" wrapperStyle={{ fontSize: 11 }} />}
          {series.map((s) => (
            <Line isAnimationActive={false} key={s.name} dataKey={s.name} stroke={s.color} strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: s.color }} activeDot={{ r: 5, stroke: "var(--color-surface)", strokeWidth: 2 }} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Série temporelle d'une activité (puissance lissée + FC), deux graphiques séparés (pas de double axe). */
export function StreamChart({ data, dataKey, color, unit, height = 140 }: { data: Record<string, number>[]; dataKey: string; color: string; unit: string; height?: number }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -4 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="t" {...AXIS} tickFormatter={(s: number) => `${Math.round(s / 60)}′`} minTickGap={40} />
          <YAxis {...AXIS} width={48} domain={["auto", "auto"]} />
          <Tooltip {...TOOLTIP} labelFormatter={(s) => `${Math.floor(Number(s) / 60)}′${String(Number(s) % 60).padStart(2, "0")}`} formatter={(v) => `${Math.round(Number(v))} ${unit}`} />
          <Line dataKey={dataKey} stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Temps dans les zones (une seule teinte, intensité croissante). */
export function ZonesChart({ zones, height = 200 }: { zones: { id: string; name: string; minutes: number }[]; height?: number }) {
  const ramp = ["#22344d", "#24497a", "#2a5fa6", "#3172c9", "#3987e5", "#6aa6ee", "#9cc4f4", "#cfe2fa"];
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <BarChart data={zones} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="id" {...AXIS} />
          <YAxis {...AXIS} width={44} />
          <Tooltip {...TOOLTIP} cursor={{ fill: "var(--color-surface-2)" }} formatter={(v) => `${Math.round(Number(v))} min`} labelFormatter={(id) => zones.find((z) => z.id === id)?.name ?? String(id)} />
          <Bar isAnimationActive={false} dataKey="minutes" name="Minutes" radius={[4, 4, 0, 0]} maxBarSize={40}>
            {zones.map((_, i) => <Cell key={i} fill={ramp[i] ?? ramp[ramp.length - 1]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Évolution d'un record (ex. 20 min) semaine par semaine. */
export function TrendChart({ data, unit, height = 160, color = "var(--color-s1)" }: { data: { label: string; value: number | null }[]; unit: string; height?: number; color?: string }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="label" {...AXIS} minTickGap={30} />
          <YAxis {...AXIS} width={48} domain={["auto", "auto"]} />
          <Tooltip {...TOOLTIP} formatter={(v) => (v == null ? "—" : `${Math.round(Number(v))} ${unit}`)} />
          <Line isAnimationActive={false} dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 3, fill: color, strokeWidth: 0 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
