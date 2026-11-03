export const fmtDate = (d: Date | string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) =>
  new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", ...opts }).format(typeof d === "string" ? new Date(d) : d);

export const fmtDay = (d: Date | string) => fmtDate(d, { weekday: "short", day: "numeric", month: "short" });

export function fmtDuration(s: number | null | undefined): string {
  if (s == null) return "—";
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
}

export const fmtNum = (v: number | null | undefined, digits = 0, unit = "") =>
  v == null || Number.isNaN(v) ? "—" : `${v.toLocaleString("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: digits })}${unit ? " " + unit : ""}`;

export const durationLabel = (s: number) => (s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${(s / 3600).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} h`);

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const CATEGORY_STYLE: Record<string, { color: string; label: string }> = {
  recuperation: { color: "var(--color-k-recup)", label: "Récup. active" },
  endurance: { color: "var(--color-k-endurance)", label: "Endurance" },
  cadence: { color: "var(--color-k-endurance)", label: "Vélocité" },
  force: { color: "var(--color-k-tempo)", label: "Force" },
  tempo: { color: "var(--color-k-tempo)", label: "Tempo" },
  sweetspot: { color: "var(--color-k-seuil)", label: "Sweet spot" },
  seuil: { color: "var(--color-k-seuil)", label: "Seuil" },
  vo2: { color: "var(--color-k-vo2)", label: "VO2 / PMA" },
  anaerobie: { color: "var(--color-k-anaerobie)", label: "Anaérobie" },
  repetition: { color: "var(--color-k-anaerobie)", label: "Répétition" },
  sprint: { color: "var(--color-k-anaerobie)", label: "Sprint" },
  clm: { color: "var(--color-k-clm)", label: "CLM" },
  activation: { color: "var(--color-k-tempo)", label: "Déblocage" },
  test: { color: "var(--color-accent)", label: "Test" },
};
export const catStyle = (c: string) => CATEGORY_STYLE[c] ?? { color: "var(--color-ink-3)", label: c };
