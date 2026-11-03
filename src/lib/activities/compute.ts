import type { ParsedActivity } from "../import/types";
import { aerobicDecoupling } from "../physio/heart";
import { hrTss } from "../physio/heart";
import { mean, meanMaxCurve, normalizedPower, toOneHz, trainingStressScore, workKj } from "../physio/power";

export interface ComputedActivity {
  durationS: number;
  elapsedS: number;
  stream: {
    time: number[];
    power: number[];
    heartRate: number[];
    cadence: number[];
    speed: number[];
    altitude: number[];
    distance: number[];
    lat: number[];
    lng: number[];
  };
  summary: {
    avgPower: number | null;
    normalizedPower: number | null;
    maxPower: number | null;
    avgHr: number | null;
    maxHr: number | null;
    avgCadence: number | null;
    avgSpeed: number | null;
    work_kJ: number | null;
    tss: number | null;
    intensityFactor: number | null;
    tssMethod: string | null;
    hrDriftPct: number | null;
    hasPower: boolean;
    hasHr: boolean;
  };
  bests: { durationS: number; watts: number }[];
}

const r1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Transforme des échantillons bruts en flux 1 Hz + indicateurs.
 * `powerRef` : référence de puissance (FTP/CP) si fiable ; sinon pas de TSS puissance.
 * `lthr` : seuil cardiaque connu ; permet un hrTSS approximatif sans capteur de puissance.
 */
export function computeActivity(p: ParsedActivity, powerRef: number | null, lthr: number | null): ComputedActivity {
  const s = p.samples;
  const t = s.t;
  const has = (a: (number | null)[]) => a.some((v) => v != null && v > 0);
  const hasPower = has(s.power);
  const hasHr = has(s.hr);
  const power = hasPower ? toOneHz(t, s.power, { maxGapS: 5, fill: 0 }).map(Math.round) : [];
  const hr = hasHr ? toOneHz(t, s.hr, { maxGapS: 10, fill: 0 }).map(Math.round) : [];
  const cadence = has(s.cadence) ? toOneHz(t, s.cadence, { maxGapS: 5, fill: 0 }).map(Math.round) : [];
  const speed = has(s.speed) ? toOneHz(t, s.speed, { maxGapS: 5, fill: 0 }) : [];
  const altitude = s.altitude.some((v) => v != null) ? toOneHz(t, s.altitude, { maxGapS: 30, fill: NaN }) : [];
  const distance = s.distance.some((v) => v != null) ? toOneHz(t, s.distance, { maxGapS: 30, fill: NaN }) : [];
  const lat = s.lat.some((v) => v != null) ? toOneHz(t, s.lat, { maxGapS: 10, fill: NaN }) : [];
  const lng = s.lng.some((v) => v != null) ? toOneHz(t, s.lng, { maxGapS: 10, fill: NaN }) : [];
  fillNaN(altitude);
  fillNaN(distance);
  fillNaN(lat);
  fillNaN(lng);

  const durationS = p.movingS ?? p.elapsedS;
  const np = hasPower ? normalizedPower(power) : null;
  const pedaling = cadence.filter((c) => c > 0);
  const hrValid = hr.filter((h) => h > 0);
  const avgHr = hrValid.length ? mean(hrValid) : null;

  let tss: number | null = null;
  let IF: number | null = null;
  let tssMethod: string | null = null;
  if (np && powerRef) {
    IF = np / powerRef;
    tss = trainingStressScore(power.length, np, powerRef);
    tssMethod = "puissance (NP / référence)";
  } else if (!hasPower && avgHr && lthr) {
    tss = hrTss(durationS, avgHr, lthr);
    tssMethod = "FC (hrTSS approximatif)";
  }

  return {
    durationS,
    elapsedS: p.elapsedS,
    stream: {
      time: Array.from({ length: Math.max(power.length, hr.length, speed.length, altitude.length) }, (_, i) => i),
      power, heartRate: hr, cadence, speed: speed.map(r2), altitude: altitude.map(r1), distance: distance.map(r1), lat, lng,
    },
    summary: {
      avgPower: hasPower ? r1(mean(power)) : null,
      normalizedPower: np ? r1(np) : null,
      maxPower: hasPower ? Math.max(...power) : null,
      avgHr: avgHr ? r1(avgHr) : null,
      maxHr: hrValid.length ? Math.max(...hrValid) : null,
      avgCadence: pedaling.length ? r1(mean(pedaling)) : null,
      avgSpeed: p.distanceM && durationS ? p.distanceM / durationS : null,
      work_kJ: hasPower ? r1(workKj(power)) : null,
      tss: tss != null ? r1(tss) : null,
      intensityFactor: IF != null ? Math.round(IF * 1000) / 1000 : null,
      tssMethod,
      hrDriftPct: hasPower && hasHr ? nullableRound(aerobicDecoupling(power, hr)) : null,
      hasPower,
      hasHr,
    },
    bests: hasPower ? meanMaxCurve(power) : [],
  };
}

function r2(x: number) {
  return Math.round(x * 100) / 100;
}
function nullableRound(x: number | null) {
  return x == null ? null : r1(x);
}
function fillNaN(a: number[]) {
  let last: number | null = null;
  for (let i = 0; i < a.length; i++) {
    if (Number.isNaN(a[i])) {
      if (last != null) a[i] = last;
    } else last = a[i];
  }
  const first = a.find((v) => !Number.isNaN(v));
  for (let i = 0; i < a.length && Number.isNaN(a[i]); i++) a[i] = first ?? 0;
}
