import { describe, expect, it } from "vitest";
import { bestAverage, fitCriticalPower, meanMaxCurve, normalizedPower, toOneHz, trainingStressScore, cpPredict } from "@/lib/physio/power";
import { computePmc } from "@/lib/physio/load";
import { aerobicDecoupling } from "@/lib/physio/heart";
import { analyzePacing } from "@/lib/physio/pacing";
import { estimateCda } from "@/lib/physio/aero";

describe("puissance", () => {
  it("NP d'un effort constant = puissance moyenne", () => {
    const p = new Array(3600).fill(250);
    expect(normalizedPower(p)).toBeCloseTo(250, 6);
  });
  it("NP > moyenne pour un effort variable", () => {
    const p = Array.from({ length: 3600 }, (_, i) => (Math.floor(i / 60) % 2 ? 350 : 150));
    expect(normalizedPower(p)!).toBeGreaterThan(250);
  });
  it("TSS d'1 h à FTP = 100", () => {
    expect(trainingStressScore(3600, 300, 300)).toBeCloseTo(100, 6);
  });
  it("meilleure moyenne glissante", () => {
    const p = [...new Array(100).fill(100), ...new Array(60).fill(400), ...new Array(100).fill(100)];
    expect(bestAverage(p, 60)).toBe(400);
    expect(bestAverage(p, 1000)).toBeNull();
    const curve = meanMaxCurve(p, [5, 60, 120]);
    expect(curve.find((c) => c.durationS === 120)!.watts).toBe(250);
  });
  it("rééchantillonnage 1 Hz : interpole les petits trous, remplit les grands", () => {
    const out = toOneHz([0, 2, 20], [100, 200, 300], { maxGapS: 5, fill: 0 });
    expect(out[1]).toBe(150);
    expect(out[10]).toBe(0);
    expect(out.length).toBe(21);
  });
  it("modèle CP 2 paramètres retrouve CP et W′ connus", () => {
    const cp = 320, wp = 20000;
    const bests = [180, 300, 480, 720, 1200].map((t) => ({ durationS: t, watts: cp + wp / t }));
    const fit = fitCriticalPower(bests)!;
    expect(fit.cp).toBeCloseTo(cp, 3);
    expect(fit.wPrime).toBeCloseTo(wp, 0);
    expect(fit.r2).toBeCloseTo(1, 6);
    expect(cpPredict(fit, 600)).toBeCloseTo(cp + wp / 600, 3);
  });
  it("modèle CP refusé avec moins de 3 durées", () => {
    expect(fitCriticalPower([{ durationS: 300, watts: 380 }, { durationS: 1200, watts: 330 }])).toBeNull();
  });
});

describe("charge", () => {
  it("CTL converge vers un TSS quotidien constant", () => {
    const days = Array.from({ length: 400 }, (_, i) => ({ date: `d${i}`, tss: 80, unknownActivities: 0 }));
    const pmc = computePmc(days);
    expect(pmc.at(-1)!.ctl).toBeCloseTo(80, 0);
    expect(Math.abs(pmc.at(-1)!.tsb)).toBeLessThan(1);
  });
});

describe("cardio et pacing", () => {
  it("découplage nul si puissance et FC stables", () => {
    expect(aerobicDecoupling(new Array(3600).fill(200), new Array(3600).fill(140))).toBeCloseTo(0, 6);
  });
  it("découplage positif si la FC dérive", () => {
    const hr = Array.from({ length: 3600 }, (_, i) => 135 + (i / 3600) * 15);
    expect(aerobicDecoupling(new Array(3600).fill(200), hr)!).toBeGreaterThan(5);
  });
  it("détecte un départ trop rapide", () => {
    const p = Array.from({ length: 1200 }, (_, i) => (i < 300 ? 400 : 320));
    const a = analyzePacing(p, [], [])!;
    expect(a.firstVsLastQuarterPct!).toBeLessThan(-8);
    expect(a.verdict.join(" ")).toMatch(/trop rapide/);
  });
});

describe("aéro (expérimental)", () => {
  it("retrouve un CdA simulé sur données synthétiques", () => {
    const cda = 0.24, m = 80, crr = 0.004, rho = 1.2, eff = 0.976, g = 9.80665;
    const n = 900;
    const speed: number[] = [], power: number[] = [], alt: number[] = [];
    let h = 100;
    for (let i = 0; i < n; i++) {
      const v = 11 + Math.sin(i / 60) * 0.5;
      const a = i ? v - speed[i - 1] : 0;
      const slope = 0.01 * Math.sin(i / 120);
      const pw = (m * g * v * (crr + slope) + m * v * a + 0.5 * rho * cda * v ** 3) / eff;
      speed.push(v); power.push(pw); h += slope * v; alt.push(h);
    }
    const r = estimateCda({ power, speed, altitude: alt, massKg: m });
    expect("error" in r).toBe(false);
    if (!("error" in r)) {
      expect(r.cda).toBeCloseTo(cda, 2);
      expect(r.low).toBeLessThanOrEqual(r.cda);
      expect(r.high).toBeGreaterThanOrEqual(r.cda);
    }
  });
  it("refuse sans données suffisantes", () => {
    const r = estimateCda({ power: [200, 200], speed: [10, 10], altitude: [0, 0], massKg: 80 });
    expect("error" in r).toBe(true);
  });
});
