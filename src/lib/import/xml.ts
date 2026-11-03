import { XMLParser } from "fast-xml-parser";
import { emptySamples, ImportError, type ParsedActivity } from "./types";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", removeNSPrefix: true, parseTagValue: true });

const arr = <T,>(x: T | T[] | undefined): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);
const n = (v: unknown): number | null => {
  const x = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(x) ? x : null;
};

function haversine(a: [number, number], b: [number, number]) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function finalize(p: Omit<ParsedActivity, "elapsedS">): ParsedActivity {
  const s = p.samples;
  // distance cumulée et vitesse si absentes (GPX)
  if (!s.distance.some((d) => d != null) && s.lat.some((l) => l != null)) {
    let acc = 0;
    for (let i = 0; i < s.t.length; i++) {
      if (i > 0 && s.lat[i] != null && s.lat[i - 1] != null) acc += haversine([s.lat[i - 1]!, s.lng[i - 1]!], [s.lat[i]!, s.lng[i]!]);
      s.distance[i] = acc;
    }
  }
  if (!s.speed.some((v) => v != null) && s.distance.some((d) => d != null)) {
    for (let i = 0; i < s.t.length; i++) {
      const dt = i > 0 ? s.t[i] - s.t[i - 1] : 0;
      s.speed[i] = i > 0 && dt > 0 && s.distance[i] != null && s.distance[i - 1] != null ? (s.distance[i]! - s.distance[i - 1]!) / dt : null;
    }
  }
  let gain = 0;
  let ref = null as number | null;
  for (const a of s.altitude) {
    if (a == null) continue;
    if (ref == null) ref = a;
    else if (a - ref > 2) { gain += a - ref; ref = a; } // hystérésis 2 m contre le bruit GPS
    else if (a < ref) ref = a;
  }
  return {
    ...p,
    elapsedS: Math.round(s.t.at(-1) ?? 0),
    distanceM: p.distanceM ?? (s.distance.filter((d) => d != null).at(-1) as number | undefined),
    elevationGainM: p.elevationGainM ?? (s.altitude.some((a) => a != null) ? Math.round(gain) : undefined),
  };
}

export function parseGpx(text: string): ParsedActivity {
  const doc = parser.parse(text);
  const trk = arr(doc?.gpx?.trk)[0];
  if (!trk) throw new ImportError("GPX sans trace (trk).");
  const pts = arr(trk.trkseg).flatMap((seg: any) => arr(seg.trkpt));
  if (!pts.length) throw new ImportError("GPX sans points.");
  if (!pts[0].time) throw new ImportError("GPX sans horodatage : impossible d'analyser l'effort (trace de parcours ?).");
  const start = new Date(pts[0].time);
  const s = emptySamples();
  for (const p of pts) {
    const ext = p.extensions ?? {};
    const tpx = ext.TrackPointExtension ?? {};
    s.t.push((new Date(p.time).getTime() - start.getTime()) / 1000);
    s.lat.push(n(p["@lat"]));
    s.lng.push(n(p["@lon"]));
    s.altitude.push(n(p.ele));
    s.hr.push(n(tpx.hr));
    s.cadence.push(n(tpx.cad));
    s.power.push(n(ext.power ?? tpx.power));
    s.speed.push(null);
    s.distance.push(null);
  }
  const type = String(trk.type ?? "cycling").toLowerCase();
  return finalize({ name: trk.name ? String(trk.name) : undefined, sport: /run/.test(type) ? "running" : "cycling", startTime: start, samples: s });
}

export function parseTcx(text: string): ParsedActivity {
  const doc = parser.parse(text);
  const act = arr(doc?.TrainingCenterDatabase?.Activities?.Activity)[0];
  if (!act) throw new ImportError("TCX sans activité.");
  const laps = arr(act.Lap);
  const pts = laps.flatMap((l: any) => arr(l.Track).flatMap((t: any) => arr(t.Trackpoint)));
  if (!pts.length) throw new ImportError("TCX sans points.");
  const start = new Date(pts[0].Time);
  const s = emptySamples();
  for (const p of pts) {
    const tpx = p.Extensions?.TPX ?? {};
    s.t.push((new Date(p.Time).getTime() - start.getTime()) / 1000);
    s.lat.push(n(p.Position?.LatitudeDegrees));
    s.lng.push(n(p.Position?.LongitudeDegrees));
    s.altitude.push(n(p.AltitudeMeters));
    s.distance.push(n(p.DistanceMeters));
    s.hr.push(n(p.HeartRateBpm?.Value));
    s.cadence.push(n(p.Cadence));
    s.power.push(n(tpx.Watts));
    s.speed.push(n(tpx.Speed));
  }
  const sport = String(act["@Sport"] ?? "Biking");
  const totalDist = laps.reduce((acc: number, l: any) => acc + (n(l.DistanceMeters) ?? 0), 0);
  return finalize({ sport: sport === "Running" ? "running" : sport === "Biking" ? "cycling" : "other", startTime: start, distanceM: totalDist || undefined, samples: s });
}
