import { Decoder, Stream } from "@garmin/fitsdk";
import { emptySamples, ImportError, type ParsedActivity } from "./types";

const SEMI = 180 / 2 ** 31;

/** Décode un fichier FIT d'activité avec le SDK officiel Garmin. */
export function parseFit(buf: Buffer): ParsedActivity {
  const stream = Stream.fromBuffer(buf);
  if (!Decoder.isFIT(stream)) throw new ImportError("Ce fichier n'est pas un fichier FIT valide.");
  const decoder = new Decoder(stream);
  if (!decoder.checkIntegrity()) throw new ImportError("Fichier FIT corrompu (CRC ou taille invalide).");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { messages, errors } = decoder.read({ convertDateTimesToDates: true, expandComponents: true, mergeHeartRates: true } as any) as any;
  if (errors?.length) throw new ImportError("Erreur de décodage FIT : " + String(errors[0]?.message ?? errors[0]));
  const records: any[] = messages.recordMesgs ?? [];
  const session: any = messages.sessionMesgs?.[0];
  if (!records.length && !session) throw new ImportError("Aucune donnée d'activité dans ce FIT (fichier de séance ou de parcours ?).");
  const start: Date = session?.startTime ?? records[0]?.timestamp;
  if (!(start instanceof Date)) throw new ImportError("Date de début introuvable dans le FIT.");
  const s = emptySamples();
  for (const r of records) {
    if (!(r.timestamp instanceof Date)) continue;
    s.t.push((r.timestamp.getTime() - start.getTime()) / 1000);
    s.power.push(num(r.power));
    s.hr.push(num(r.heartRate));
    s.cadence.push(num(r.cadence));
    s.speed.push(num(r.enhancedSpeed ?? r.speed));
    s.altitude.push(num(r.enhancedAltitude ?? r.altitude));
    s.distance.push(num(r.distance));
    s.lat.push(r.positionLat != null ? r.positionLat * SEMI : null);
    s.lng.push(r.positionLong != null ? r.positionLong * SEMI : null);
  }
  const sport = String(session?.sport ?? messages.sportMesgs?.[0]?.sport ?? "cycling");
  const subSport = session?.subSport != null ? String(session.subSport) : undefined;
  const powerDev = (messages.deviceInfoMesgs ?? []).find((d: any) => d.antplusDeviceType === "bikePower" || d.deviceType === 11);
  const creator = messages.fileIdMesgs?.[0];
  return {
    sport: sport === "cycling" || sport === "eBiking" ? "cycling" : sport,
    subSport,
    startTime: start,
    elapsedS: Math.round(session?.totalElapsedTime ?? (s.t.at(-1) ?? 0)),
    movingS: session?.totalTimerTime != null ? Math.round(session.totalTimerTime) : undefined,
    distanceM: num(session?.totalDistance) ?? undefined,
    elevationGainM: num(session?.totalAscent) ?? undefined,
    indoor: subSport === "indoorCycling" || subSport === "virtualActivity" || subSport === "spin",
    device: creator ? [creator.manufacturer, creator.garminProduct ?? creator.product].filter(Boolean).join(" ") : undefined,
    powerSensorId: powerDev?.serialNumber != null ? String(powerDev.serialNumber) : undefined,
    samples: s,
  };
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
