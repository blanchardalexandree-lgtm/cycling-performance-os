import type { ActivitySource, Prisma } from "@prisma/client";
import { prisma } from "../db";
import type { ParsedActivity } from "../import/types";
import { powerReference } from "../references";
import { referencesAt } from "./recompute";
import { computeActivity } from "./compute";
import { matchActivityToPlan } from "../planning/adaptation";

export type IngestResult =
  | { status: "created"; activityId: string }
  | { status: "merged"; activityId: string }
  | { status: "duplicate"; activityId: string }
  | { status: "ignored"; reason: string };

/** Tolérances de détection d'une même activité venant de plusieurs sources. */
export const DEDUPE_START_TOLERANCE_S = 180;
export const DEDUPE_DURATION_TOLERANCE = 0.1;

export function isSameEffort(a: { startTime: Date; durationS: number }, b: { startTime: Date; durationS: number }) {
  const dt = Math.abs(a.startTime.getTime() - b.startTime.getTime()) / 1000;
  const dd = Math.abs(a.durationS - b.durationS) / Math.max(a.durationS, b.durationS, 1);
  return dt <= DEDUPE_START_TOLERANCE_S && (dd <= DEDUPE_DURATION_TOLERANCE || Math.abs(a.durationS - b.durationS) <= 300);
}

interface IngestOptions {
  userId: string;
  source: ActivitySource;
  externalId: string;
  parsed: ParsedActivity;
  raw?: Prisma.InputJsonValue;
  restricted?: boolean;
  name?: string;
  isRace?: boolean;
}

/**
 * Point d'entrée unique pour toute activité (fichier, Strava, Garmin…).
 * 1. Même (source, externalId) déjà connu → doublon.
 * 2. Même effort déjà présent (autre source) → fusion : la source est rattachée,
 *    les flux manquants sont complétés ; l'activité ne compte qu'une fois.
 * 3. Sinon création + calculs + rapprochement avec la séance prévue.
 */
export async function ingestActivity(o: IngestOptions): Promise<IngestResult> {
  const { userId, source, externalId, parsed } = o;
  if (parsed.sport !== "cycling") return { status: "ignored", reason: `Sport non cycliste (${parsed.sport})` };
  if (parsed.samples.t.length < 2 && !parsed.elapsedS) return { status: "ignored", reason: "Activité vide" };

  const known = await prisma.activitySourceRecord.findUnique({ where: { userId_source_externalId: { userId, source, externalId } } });
  if (known) return { status: "duplicate", activityId: known.activityId };

  const { refs, posterior } = await referencesAt(userId, parsed.startTime);
  const pref = powerReference(refs);
  const c = computeActivity(parsed, pref?.watts ?? null, refs.lthr?.value ?? null);
  if (pref && c.summary.tssMethod?.startsWith("puissance")) c.summary.tssMethod += ` — ${pref.label} ${Math.round(pref.watts)} W`;
  if (posterior && c.summary.tssMethod) c.summary.tssMethod += " (référence postérieure à l'activité)";

  const windowStart = new Date(parsed.startTime.getTime() - DEDUPE_START_TOLERANCE_S * 1000);
  const windowEnd = new Date(parsed.startTime.getTime() + DEDUPE_START_TOLERANCE_S * 1000);
  const candidates = await prisma.activity.findMany({
    where: { userId, startTime: { gte: windowStart, lte: windowEnd } },
    include: { stream: { select: { activityId: true } } },
  });
  const twin = candidates.find((a) => isSameEffort(a, { startTime: parsed.startTime, durationS: c.durationS }));

  if (twin) {
    const upgradeStream = !twin.hasPower && c.summary.hasPower;
    await prisma.$transaction(async (tx) => {
      await tx.activitySourceRecord.create({ data: { activityId: twin.id, userId, source, externalId, raw: o.raw, restricted: o.restricted ?? false } });
      const patch: Prisma.ActivityUpdateInput = {};
      for (const [k, v] of Object.entries(c.summary)) {
        const cur = (twin as Record<string, unknown>)[k];
        if ((cur == null || (upgradeStream && k !== "hasHr")) && v != null) (patch as Record<string, unknown>)[k] = v;
      }
      if (twin.distanceM == null && parsed.distanceM != null) patch.distanceM = parsed.distanceM;
      if (twin.elevationGainM == null && parsed.elevationGainM != null) patch.elevationGainM = parsed.elevationGainM;
      if (Object.keys(patch).length) await tx.activity.update({ where: { id: twin.id }, data: patch });
      if (upgradeStream || !twin.stream) {
        await tx.activityStream.upsert({ where: { activityId: twin.id }, create: { activityId: twin.id, ...c.stream }, update: c.stream });
        await tx.powerBest.deleteMany({ where: { activityId: twin.id } });
        if (c.bests.length) {
          await tx.powerBest.createMany({ data: c.bests.map((b) => ({ ...b, userId, activityId: twin.id, date: twin.startTime, isRace: twin.isRace })) });
        }
      }
    });
    return { status: "merged", activityId: twin.id };
  }

  const act = await prisma.activity.create({
    data: {
      userId,
      name: o.name ?? parsed.name ?? "Sortie vélo",
      startTime: parsed.startTime,
      durationS: c.durationS,
      elapsedS: c.elapsedS,
      distanceM: parsed.distanceM ?? null,
      elevationGainM: parsed.elevationGainM ?? null,
      isIndoor: parsed.indoor ?? false,
      isRace: o.isRace ?? false,
      powerSensorId: parsed.powerSensorId ?? null,
      ...c.summary,
      sources: { create: { userId, source, externalId, raw: o.raw, restricted: o.restricted ?? false } },
      stream: { create: c.stream },
    },
  });
  if (c.bests.length) {
    await prisma.powerBest.createMany({ data: c.bests.map((b) => ({ ...b, userId, activityId: act.id, date: act.startTime, isRace: act.isRace })) });
  }
  await matchActivityToPlan(userId, act.id);
  return { status: "created", activityId: act.id };
}
