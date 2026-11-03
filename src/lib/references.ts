import type { DataOrigin, MetricValue } from "@prisma/client";
import { prisma } from "./db";

/** Clés de métriques reconnues, avec libellé et unité. */
export const METRIC_DEFS: Record<string, { label: string; unit: string; group: string }> = {
  FTP: { label: "FTP", unit: "W", group: "Puissance" },
  CP: { label: "Puissance critique (CP)", unit: "W", group: "Puissance" },
  W_PRIME: { label: "Réserve W′", unit: "kJ", group: "Puissance" },
  PMA: { label: "PMA", unit: "W", group: "Puissance" },
  MMP_5S: { label: "Max 5 s", unit: "W", group: "Records" },
  MMP_15S: { label: "Max 15 s", unit: "W", group: "Records" },
  MMP_30S: { label: "Max 30 s", unit: "W", group: "Records" },
  MMP_1MIN: { label: "Max 1 min", unit: "W", group: "Records" },
  MMP_3MIN: { label: "Max 3 min", unit: "W", group: "Records" },
  MMP_5MIN: { label: "Max 5 min", unit: "W", group: "Records" },
  MMP_8MIN: { label: "Max 8 min", unit: "W", group: "Records" },
  MMP_12MIN: { label: "Max 12 min", unit: "W", group: "Records" },
  MMP_20MIN: { label: "Max 20 min", unit: "W", group: "Records" },
  MMP_40MIN: { label: "Max 40 min", unit: "W", group: "Records" },
  HR_MAX: { label: "FC max", unit: "bpm", group: "Cardio" },
  HR_REST: { label: "FC repos", unit: "bpm", group: "Cardio" },
  LTHR: { label: "FC au seuil (LTHR)", unit: "bpm", group: "Cardio" },
  WEIGHT: { label: "Poids", unit: "kg", group: "Corps" },
  BIKE_WEIGHT: { label: "Poids du vélo CLM", unit: "kg", group: "Corps" },
};

export const ORIGIN_LABEL: Record<DataOrigin, string> = {
  MEASURED: "Mesuré",
  ESTIMATED: "Estimé",
  DECLARED: "Déclaré",
  ASSUMED: "Hypothèse",
};

export type Ref = Pick<MetricValue, "value" | "unit" | "date" | "origin" | "source" | "method" | "uncertainty">;

export interface References {
  ftp: Ref | null;
  cp: Ref | null;
  wPrime: Ref | null;
  pma: Ref | null;
  lthr: Ref | null;
  hrMax: Ref | null;
  hrRest: Ref | null;
  weight: Ref | null;
}

/** Dernière valeur connue de chaque référence à une date donnée. */
export async function getReferences(userId: string, at: Date = new Date()): Promise<References> {
  const keys = ["FTP", "CP", "W_PRIME", "PMA", "LTHR", "HR_MAX", "HR_REST", "WEIGHT"];
  const rows = await prisma.metricValue.findMany({
    where: { userId, key: { in: keys }, date: { lte: at } },
    orderBy: { date: "desc" },
  });
  const pick = (k: string) => rows.find((r) => r.key === k) ?? null;
  return {
    ftp: pick("FTP"),
    cp: pick("CP"),
    wPrime: pick("W_PRIME"),
    pma: pick("PMA"),
    lthr: pick("LTHR"),
    hrMax: pick("HR_MAX"),
    hrRest: pick("HR_REST"),
    weight: pick("WEIGHT"),
  };
}

/**
 * Référence de puissance utilisée pour prescrire et calculer la charge.
 * Ordre de préférence : FTP mesurée/déclarée > CP estimée > FTP estimée. Jamais d'hypothèse.
 */
export function powerReference(refs: References): { watts: number; label: string; origin: DataOrigin } | null {
  if (refs.ftp && (refs.ftp.origin === "MEASURED" || refs.ftp.origin === "DECLARED")) {
    return { watts: refs.ftp.value, label: `FTP ${ORIGIN_LABEL[refs.ftp.origin].toLowerCase()}e`, origin: refs.ftp.origin };
  }
  if (refs.cp) return { watts: refs.cp.value, label: "CP estimée", origin: refs.cp.origin };
  if (refs.ftp && refs.ftp.origin === "ESTIMATED") return { watts: refs.ftp.value, label: "FTP estimée", origin: "ESTIMATED" };
  return null;
}
