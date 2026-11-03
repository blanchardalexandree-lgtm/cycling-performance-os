import { describe, expect, it } from "vitest";
import { generatePlan, phaseFor, validateSequence, addDays, type PlanGoal } from "@/lib/planning/cycle";
import { buildWorkout, TEMPLATES } from "@/lib/planning/library";
import { totalDurationS, estimateTss, flatten } from "@/lib/planning/types";
import { evaluateCompliance } from "@/lib/planning/compliance";
import { assessReadiness } from "@/lib/planning/readiness";
import { resolveBlocks } from "@/lib/planning/resolve";

const WEEK = [90, 90, 90, 90, 90, 240, 240];
const base = { constraints: [], weeklyMinutes: WEEK, lastMeasuredRefDate: "2026-11-01" };

describe("cycle 3 + 1", () => {
  it("répète 3 jours d'entraînement puis 1 récupération active, sans journée off", () => {
    const days = generatePlan({ ...base, start: "2026-11-10", end: "2026-12-09", goals: [] });
    expect(days).toHaveLength(30);
    expect(days.some((d) => d.role === "OFF")).toBe(false);
    for (let i = 0; i < days.length; i++) {
      const expectedRecovery = i % 4 === 3;
      expect(days[i].role === "ACTIVE_RECOVERY").toBe(expectedRecovery);
      if (expectedRecovery) {
        expect(days[i].workout!.category).toBe("recuperation");
        expect(flatten(days[i].workout!.blocks).every((s) => s.high <= 0.55)).toBe(true);
      }
    }
  });
  it("ne cale pas le cycle sur la semaine (ancre)", () => {
    const days = generatePlan({ ...base, start: "2026-11-10", end: "2026-11-20", anchor: "2026-11-08", goals: [] });
    // 08 = J1 → 10 = J3 → 11 = J4 (récup)
    expect(days[0].cycleIndex).toBe(3);
    expect(days[1].role).toBe("ACTIVE_RECOVERY");
  });
  it("course : veille = déblocage, lendemain = récupération active, puis redémarrage au jour 1", () => {
    const goals: PlanGoal[] = [{ id: "r1", name: "Manche Atlantique", date: "2026-11-20", priority: "B", kind: "course" }];
    const days = generatePlan({ ...base, start: "2026-11-10", end: "2026-11-30", goals });
    const at = (d: string) => days.find((x) => x.date === d)!;
    expect(at("2026-11-19").workout!.templateId).toBe("opener");
    expect(at("2026-11-20").role).toBe("RACE");
    expect(at("2026-11-21").role).toBe("ACTIVE_RECOVERY");
    expect(at("2026-11-22").cycleIndex).toBe(1);
  });
  it("course à étapes : récupération après la dernière étape seulement", () => {
    const goals: PlanGoal[] = [{ id: "e", name: "Essor Breton", date: "2027-05-21", endDate: "2027-05-24", priority: "B", kind: "etapes" }];
    const days = generatePlan({ ...base, start: "2027-05-15", end: "2027-05-30", goals });
    const roles = days.filter((d) => d.date >= "2027-05-21" && d.date <= "2027-05-25").map((d) => d.role);
    expect(roles).toEqual(["RACE", "RACE", "RACE", "RACE", "ACTIVE_RECOVERY"]);
  });
  it("respecte le temps disponible du jour", () => {
    const days = generatePlan({ ...base, weeklyMinutes: [60, 60, 60, 60, 60, 60, 60], start: "2026-11-10", end: "2026-12-30", goals: [] });
    for (const d of days) if (d.workout) expect(d.workout.durationMin).toBeLessThanOrEqual(61);
  });
  it("contrainte d'examen : temps maximum respecté et journée off seulement si imposée", () => {
    const days = generatePlan({
      ...base, start: "2026-12-01", end: "2026-12-10", goals: [],
      constraints: [{ start: "2026-12-03", end: "2026-12-04", maxTrainingMin: 45, title: "Partiels" }, { start: "2026-12-06", end: "2026-12-06", noTraining: true, title: "Déplacement" }],
    });
    const at = (d: string) => days.find((x) => x.date === d)!;
    expect(at("2026-12-03").workout!.durationMin).toBeLessThanOrEqual(46);
    expect(at("2026-12-06").role).toBe("OFF");
    expect(days.filter((d) => d.role === "OFF")).toHaveLength(1);
  });
  it("jamais deux séances « high » consécutives, rien d'exigeant 2 jours avant une course", () => {
    const goals: PlanGoal[] = [
      { id: "a", name: "Championnat de France CLM", date: "2027-06-25", priority: "A", kind: "clm" },
      { id: "b", name: "Championnat de France", date: "2027-06-26", priority: "A", kind: "course" },
      { id: "c", name: "Route Vendéenne", date: "2027-06-11", endDate: "2027-06-13", priority: "B", kind: "etapes" },
    ];
    const days = generatePlan({ ...base, start: "2027-03-01", end: "2027-07-10", goals });
    const seq = days.map((d) => ({ date: d.date, role: d.role, intensity: d.workout?.intensity ?? null }));
    const issues = validateSequence(seq, ["2027-06-25", "2027-06-26", "2027-06-11", "2027-06-12", "2027-06-13"]);
    expect(issues.filter((i) => i.includes("consécutives") || i.includes("avant une course"))).toEqual([]);
  });
  it("propose un test si aucune référence mesurée, au plus une fois / 6 semaines", () => {
    const days = generatePlan({ ...base, lastMeasuredRefDate: null, start: "2026-11-10", end: "2027-01-10", goals: [] });
    const tests = days.filter((d) => d.role === "TEST").map((d) => d.date);
    expect(tests.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < tests.length; i++) expect(new Date(tests[i]).getTime() - new Date(tests[i - 1]).getTime()).toBeGreaterThan(42 * 86400_000);
  });
});

describe("phases", () => {
  const goals: PlanGoal[] = [{ id: "a", name: "CdF CLM", date: "2027-06-25", priority: "A", kind: "clm" }];
  it("affûtage, spécifique, développement, général", () => {
    expect(phaseFor("2027-06-20", goals).phase).toBe("taper");
    expect(phaseFor("2027-06-01", goals).phase).toBe("specific");
    expect(phaseFor("2027-04-01", goals).phase).toBe("development");
    expect(phaseFor("2026-12-01", goals).phase).toBe("general");
    expect(phaseFor("2027-06-27", goals).phase).toBe("transition");
  });
});

describe("bibliothèque de séances", () => {
  it("chaque modèle se construit à sa durée idéale et la respecte", () => {
    for (const t of TEMPLATES) {
      const w = buildWorkout(t.id, t.idealMin)!;
      expect(w, t.id).not.toBeNull();
      expect(totalDurationS(w.blocks) / 60, t.id).toBeLessThanOrEqual(t.idealMin + 1);
      expect(estimateTss(w.blocks)).toBeGreaterThan(0);
    }
  });
  it("variante courte quand le seuil ne tient pas en 50 min", () => {
    const w = buildWorkout("seuil", 50);
    expect(w).not.toBeNull();
    expect(totalDurationS(w!.blocks) / 60).toBeLessThanOrEqual(50);
  });
  it("aucun watt sans référence ; watts calculés avec une référence", () => {
    const w = buildWorkout("seuil", 90)!;
    const noRef = resolveBlocks(w.blocks, null);
    const withRef = resolveBlocks(w.blocks, 300);
    const firstStep = (x: typeof noRef[number]) => ("steps" in x ? x.steps[0] : x);
    expect(firstStep(noRef[1]).wattsLow).toBeNull();
    expect(firstStep(withRef[1]).wattsLow).toBe(285);
  });
});

describe("conformité et état de forme", () => {
  it("compare prescription et réalisation", () => {
    const c = evaluateCompliance({ durationMin: 90, plannedTss: 80, category: "seuil" }, { durationS: 45 * 60, tss: 40, intensityFactor: 0.8 });
    expect(c.status).toBe("PARTIAL");
    expect(c.notes.join(" ")).toMatch(/inférieure/);
  });
  it("un indicateur isolé ne suffit pas", () => {
    const hist = Array.from({ length: 20 }, (_, i) => ({ date: addDays("2026-10-01", i), hrvMs: 80, restingHr: 45, sleepHours: 8 }));
    hist.push({ date: "2026-10-21", hrvMs: 80, restingHr: 52, sleepHours: 8 });
    expect(assessReadiness(hist).level).toBe("green");
  });
  it("plusieurs indicateurs concordants → orange ou rouge", () => {
    const hist = Array.from({ length: 20 }, (_, i) => ({ date: addDays("2026-10-01", i), hrvMs: 80 + (i % 3), restingHr: 45, sleepHours: 8 }));
    hist.push({ date: "2026-10-21", hrvMs: 50, restingHr: 54, sleepHours: 5, fatigue: 5 } as never);
    expect(["amber", "red"]).toContain(assessReadiness(hist).level);
  });
  it("maladie → journée sans vélo recommandée", () => {
    const r = assessReadiness([{ date: "2026-10-21", illness: true }]);
    expect(r.level).toBe("stop");
    expect(r.loadFactor).toBe(0);
  });
});
