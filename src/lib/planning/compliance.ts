/** Comparaison prescription / exécution (pur, testé). */
export interface Compliance {
  durationRatio: number | null;
  tssRatio: number | null;
  ifPlanned: number | null;
  ifActual: number | null;
  status: "COMPLETED" | "PARTIAL" | "MISSED";
  score: number; // 0-100
  notes: string[];
}

export function evaluateCompliance(
  planned: { durationMin: number; plannedTss: number | null; category: string },
  actual: { durationS: number; tss: number | null; intensityFactor: number | null },
): Compliance {
  const notes: string[] = [];
  const dr = planned.durationMin > 0 ? actual.durationS / 60 / planned.durationMin : null;
  const tr = planned.plannedTss && actual.tss != null ? actual.tss / planned.plannedTss : null;
  const ifPlanned = planned.plannedTss && planned.durationMin ? Math.sqrt(planned.plannedTss / ((planned.durationMin / 60) * 100)) : null;
  const ifActual = actual.intensityFactor;
  let status: Compliance["status"] = "COMPLETED";
  if (dr != null && dr < 0.4) status = "PARTIAL";
  else if (dr != null && dr < 0.8) status = "PARTIAL";
  let score = 100;
  if (dr != null) score -= Math.min(50, Math.abs(1 - dr) * 60);
  if (tr != null) score -= Math.min(40, Math.abs(1 - tr) * 50);
  if (dr != null && dr > 1.25) notes.push(`Durée supérieure de ${Math.round((dr - 1) * 100)} % à la prescription.`);
  if (dr != null && dr < 0.8) notes.push(`Durée inférieure de ${Math.round((1 - dr) * 100)} % à la prescription.`);
  if (tr != null && tr > 1.3) notes.push(`Charge réalisée ${Math.round((tr - 1) * 100)} % au-dessus du prévu.`);
  if (tr != null && tr < 0.7) notes.push(`Charge réalisée ${Math.round((1 - tr) * 100)} % sous le prévu.`);
  if (planned.category === "recuperation" && ifActual != null && ifActual > 0.62) notes.push("Récupération trop intense (IF > 0,62) : elle ne remplit plus son rôle.");
  if (tr == null) notes.push("Charge non comparable (pas de puissance ou pas de référence fiable).");
  return { durationRatio: dr, tssRatio: tr, ifPlanned, ifActual, status, score: Math.max(0, Math.round(score)), notes };
}
