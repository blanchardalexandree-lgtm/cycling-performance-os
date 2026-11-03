import { prisma } from "../db";
import { getReferences, powerReference, type References } from "../references";
import { hrTss } from "../physio/heart";

/**
 * Référence applicable à une date : la dernière connue à cette date ; à défaut, la plus
 * ancienne postérieure (cas typique : FTP saisie aujourd'hui, historique importé ensuite).
 * Le libellé l'indique pour ne pas masquer l'approximation.
 */
export async function referencesAt(userId: string, date: Date): Promise<{ refs: References; posterior: boolean }> {
  const refs = await getReferences(userId, date);
  if (powerReference(refs) || refs.lthr) return { refs, posterior: false };
  // Plus ancienne valeur postérieure, par métrique (et non la plus récente).
  const rows = await prisma.metricValue.findMany({
    where: { userId, key: { in: ["FTP", "CP", "W_PRIME", "PMA", "LTHR", "HR_MAX", "HR_REST", "WEIGHT"] }, date: { gt: date } },
    orderBy: { date: "asc" },
  });
  const first = (k: string) => rows.find((r) => r.key === k) ?? null;
  const later: References = {
    ftp: refs.ftp ?? first("FTP"), cp: refs.cp ?? first("CP"), wPrime: refs.wPrime ?? first("W_PRIME"), pma: refs.pma ?? first("PMA"),
    lthr: refs.lthr ?? first("LTHR"), hrMax: refs.hrMax ?? first("HR_MAX"), hrRest: refs.hrRest ?? first("HR_REST"), weight: refs.weight ?? first("WEIGHT"),
  };
  return { refs: later, posterior: Boolean(powerReference(later) || later.lthr) };
}

/** Recalcule IF/TSS de toutes les activités après un changement de référence. */
export async function recomputeLoad(userId: string) {
  const acts = await prisma.activity.findMany({ where: { userId }, select: { id: true, startTime: true, normalizedPower: true, elapsedS: true, durationS: true, avgHr: true, hasPower: true } });
  let n = 0;
  for (const a of acts) {
    const { refs, posterior } = await referencesAt(userId, a.startTime);
    const pref = powerReference(refs);
    const secs = a.elapsedS ?? a.durationS;
    let data: { tss: number | null; intensityFactor: number | null; tssMethod: string | null } = { tss: null, intensityFactor: null, tssMethod: null };
    if (a.normalizedPower && pref) {
      const IF = a.normalizedPower / pref.watts;
      data = { tss: Math.round(((secs * a.normalizedPower * IF) / (pref.watts * 3600)) * 1000) / 10, intensityFactor: Math.round(IF * 1000) / 1000, tssMethod: `puissance (NP / référence) — ${pref.label} ${Math.round(pref.watts)} W${posterior ? " (référence postérieure à l'activité)" : ""}` };
    } else if (!a.hasPower && a.avgHr && refs.lthr) {
      data = { tss: Math.round(hrTss(a.durationS, a.avgHr, refs.lthr.value) * 10) / 10, intensityFactor: null, tssMethod: `FC (hrTSS approximatif)${posterior ? " (référence postérieure)" : ""}` };
    }
    await prisma.activity.update({ where: { id: a.id }, data });
    n++;
  }
  return n;
}
