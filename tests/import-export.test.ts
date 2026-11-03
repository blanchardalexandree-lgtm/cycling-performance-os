import { describe, expect, it } from "vitest";
import { Decoder, Encoder, Profile, Stream } from "@garmin/fitsdk";
import { parseActivityFile } from "@/lib/import";
import { computeActivity } from "@/lib/activities/compute";
import { isSameEffort } from "@/lib/activities/ingest";
import { buildWorkout } from "@/lib/planning/library";
import { toFitWorkout, toMrc, toZwo } from "@/lib/planning/export";
import { mapStravaActivity, nearLimit, parseRateLimit } from "@/lib/integrations/strava";

/** Fabrique un vrai fichier FIT d'activité avec le SDK officiel (1 h, 250 W, FC 145). */
function makeFit(): Buffer {
  const enc = new Encoder() as unknown as { onMesg: (n: number, m: Record<string, unknown>) => void; close: () => Uint8Array };
  const start = new Date("2026-10-30T08:00:00Z");
  enc.onMesg(Profile.MesgNum.FILE_ID, { manufacturer: "development", product: 1, timeCreated: start, type: "activity", serialNumber: 42 });
  for (let i = 0; i < 3600; i++) {
    enc.onMesg(Profile.MesgNum.RECORD, {
      timestamp: new Date(start.getTime() + i * 1000), power: 250, heartRate: 145, cadence: 90, distance: i * 10, enhancedSpeed: 10, enhancedAltitude: 50,
    });
  }
  enc.onMesg(Profile.MesgNum.SESSION, {
    timestamp: new Date(start.getTime() + 3600_000), startTime: start, totalElapsedTime: 3600, totalTimerTime: 3600, totalDistance: 36000, totalAscent: 120,
    sport: "cycling", subSport: "road", messageIndex: 0, firstLapIndex: 0, numLaps: 1, event: "session", eventType: "stop",
  });
  return Buffer.from(enc.close());
}

const GPX = `<?xml version="1.0"?><gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
<trk><name>Sortie GPX</name><type>cycling</type><trkseg>
${Array.from({ length: 120 }, (_, i) => `<trkpt lat="${47 + i * 0.0001}" lon="${-1.5}"><ele>${10 + i * 0.1}</ele><time>${new Date(Date.UTC(2026, 9, 29, 9, 0, i)).toISOString()}</time><extensions><power>200</power><gpxtpx:TrackPointExtension><gpxtpx:hr>130</gpxtpx:hr><gpxtpx:cad>88</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions></trkpt>`).join("\n")}
</trkseg></trk></gpx>`;

const TCX = `<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
<Activities><Activity Sport="Biking"><Id>2026-10-28T10:00:00Z</Id><Lap StartTime="2026-10-28T10:00:00Z"><DistanceMeters>600</DistanceMeters><Track>
${Array.from({ length: 60 }, (_, i) => `<Trackpoint><Time>${new Date(Date.UTC(2026, 9, 28, 10, 0, i)).toISOString()}</Time><DistanceMeters>${i * 10}</DistanceMeters><HeartRateBpm><Value>140</Value></HeartRateBpm><Cadence>92</Cadence><Extensions><ns3:TPX><ns3:Watts>300</ns3:Watts></ns3:TPX></Extensions></Trackpoint>`).join("\n")}
</Track></Lap></Activity></Activities></TrainingCenterDatabase>`;

describe("import de fichiers", () => {
  it("FIT : décode, calcule NP, TSS et courbe de puissance", () => {
    const { kind, parsed, hash } = parseActivityFile("sortie.fit", makeFit());
    expect(kind).toBe("FILE_FIT");
    expect(hash).toHaveLength(64);
    expect(parsed.sport).toBe("cycling");
    expect(parsed.elapsedS).toBe(3600);
    const c = computeActivity(parsed, 300, null);
    expect(c.summary.avgPower).toBe(250);
    expect(c.summary.normalizedPower).toBeCloseTo(250, 0);
    expect(c.summary.tss!).toBeCloseTo(69.4, 0); // 1 h à IF 0,833
    expect(c.bests.find((b) => b.durationS === 1200)!.watts).toBe(250);
  });
  it("FIT : pas de TSS sans référence fiable", () => {
    const { parsed } = parseActivityFile("sortie.fit", makeFit());
    expect(computeActivity(parsed, null, null).summary.tss).toBeNull();
  });
  it("GPX avec extensions puissance/FC", () => {
    const { kind, parsed } = parseActivityFile("x.gpx", Buffer.from(GPX));
    expect(kind).toBe("FILE_GPX");
    expect(parsed.name).toBe("Sortie GPX");
    expect(parsed.distanceM!).toBeGreaterThan(100);
    const c = computeActivity(parsed, null, null);
    expect(c.summary.avgPower).toBe(200);
    expect(c.summary.avgHr).toBe(130);
  });
  it("TCX", () => {
    const { kind, parsed } = parseActivityFile("x.tcx", Buffer.from(TCX));
    expect(kind).toBe("FILE_TCX");
    expect(computeActivity(parsed, null, null).summary.avgPower).toBe(300);
  });
  it("refuse un format inconnu", () => {
    expect(() => parseActivityFile("x.csv", Buffer.from("a,b"))).toThrow(/Format non reconnu/);
  });
});

describe("anti-doublons", () => {
  it("même effort de deux sources", () => {
    const a = { startTime: new Date("2026-10-30T08:00:00Z"), durationS: 3600 };
    expect(isSameEffort(a, { startTime: new Date("2026-10-30T08:01:30Z"), durationS: 3480 })).toBe(true);
    expect(isSameEffort(a, { startTime: new Date("2026-10-30T14:00:00Z"), durationS: 3600 })).toBe(false);
  });
});

describe("exports de séances", () => {
  const w = buildWorkout("seuil", 90)!;
  it("ZWO : XML bien formé avec IntervalsT", () => {
    const x = toZwo(w.title, w.objective, w.blocks);
    expect(x).toContain("<workout_file>");
    expect(x).toMatch(/<IntervalsT Repeat="\d" OnDuration="600"/);
  });
  it("MRC : en-tête et données en minutes/%", () => {
    const x = toMrc(w.title, w.objective, w.blocks);
    expect(x).toContain("MINUTES PERCENT");
    expect(x.split("\n").filter((l) => /^\d+\.\d{2}\t\d+$/.test(l)).length).toBeGreaterThan(4);
  });
  it("FIT workout : relu par le SDK Garmin, cibles en watts absolus", () => {
    const bytes = toFitWorkout(w.title, w.blocks, 300);
    const dec = new Decoder(Stream.fromByteArray(Array.from(bytes)));
    expect(dec.checkIntegrity()).toBe(true);
    const { messages, errors } = dec.read();
    expect(errors).toEqual([]);
    expect(messages.workoutMesgs![0].sport).toBe("cycling");
    const steps = messages.workoutStepMesgs as Record<string, unknown>[];
    const seuil = steps.find((s) => s.wktStepName === "Seuil")!;
    expect(seuil.customTargetPowerLow ?? seuil.customTargetValueLow).toBe(285 + 1000);
    expect(seuil.durationTime).toBe(600);
    expect(steps.some((s) => s.durationType === "repeatUntilStepsCmplt")).toBe(true);
  });
});

describe("Strava (sans réseau)", () => {
  it("lit les en-têtes de quota", () => {
    const h = new Headers({ "x-readratelimit-limit": "100,1000", "x-readratelimit-usage": "97,400" });
    const r = parseRateLimit(h)!;
    expect(r.shortUsage).toBe(97);
    expect(nearLimit(r)).toBe(true);
  });
  it("ignore la puissance estimée (device_watts = false)", () => {
    const p = mapStravaActivity(
      { id: 1, name: "Sortie", type: "Ride", start_date: "2026-10-30T08:00:00Z", elapsed_time: 3, moving_time: 3, distance: 30, total_elevation_gain: 0, device_watts: false },
      { time: { data: [0, 1, 2] }, watts: { data: [200, 210, 220] }, heartrate: { data: [120, 121, 122] } },
    );
    expect(p.samples.power.every((x) => x === null)).toBe(true);
    expect(p.samples.hr).toEqual([120, 121, 122]);
  });
});
