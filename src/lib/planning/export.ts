/**
 * Exports de séances dans des formats réellement acceptés :
 *  - .zwo  : format XML de Zwift (import dans Documents/Zwift/Workouts/<id>). Intensités en
 *            fraction de FTP : Zwift applique sa propre FTP.
 *  - .mrc  : format texte « course » en % de FTP (TrainerRoad, Golden Cheetah, PerfPRO, nombreux
 *            logiciels de home trainer).
 *  - .fit  : fichier FIT de type « workout » (SDK officiel Garmin). Cibles en watts absolus
 *            (convention FIT : valeur + 1000) si une référence existe, sinon en % FTP.
 *            L'encodeur n'écrit que les champs principaux (durationValue, customTargetValueLow…).
 *            À copier dans le dossier GARMIN/NewFiles d'un compteur Edge par USB.
 */
import { Encoder, Profile } from "@garmin/fitsdk";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMesg = any;
import type { Block, Step } from "./types";
import { flatten, isRepeat } from "./types";

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
const f2 = (x: number) => x.toFixed(2);
const mid = (s: Step) => (s.low + s.high) / 2;

export function toZwo(title: string, description: string, blocks: Block[]): string {
  const lines: string[] = [];
  const cad = (s: Step) => (s.cadence ? ` Cadence="${Math.round((s.cadence[0] + s.cadence[1]) / 2)}"` : "");
  const one = (s: Step) => {
    if (s.kind === "warmup") return `    <Warmup Duration="${s.durationS}" PowerLow="${f2(s.low)}" PowerHigh="${f2(s.high)}"${cad(s)}/>`;
    if (s.kind === "cooldown") return `    <Cooldown Duration="${s.durationS}" PowerLow="${f2(s.high)}" PowerHigh="${f2(s.low)}"${cad(s)}/>`;
    if (s.kind === "sprint") return `    <FreeRide Duration="${s.durationS}" FlatRoad="0"/>`;
    return `    <SteadyState Duration="${s.durationS}" Power="${f2(mid(s))}"${cad(s)}/>`;
  };
  for (const b of blocks) {
    if (isRepeat(b) && b.steps.length === 2 && b.steps.every((s) => s.kind !== "sprint")) {
      const [on, off] = b.steps;
      lines.push(`    <IntervalsT Repeat="${b.count}" OnDuration="${on.durationS}" OffDuration="${off.durationS}" OnPower="${f2(mid(on))}" OffPower="${f2(mid(off))}"${on.cadence ? ` Cadence="${Math.round((on.cadence[0] + on.cadence[1]) / 2)}"` : ""}/>`);
    } else if (isRepeat(b)) {
      for (let i = 0; i < b.count; i++) for (const s of b.steps) lines.push(one(s));
    } else lines.push(one(b));
  }
  return `<workout_file>
  <author>Cycling Performance OS</author>
  <name>${esc(title)}</name>
  <description>${esc(description)}</description>
  <sportType>bike</sportType>
  <tags/>
  <workout>
${lines.join("\n")}
  </workout>
</workout_file>
`;
}

export function toMrc(title: string, description: string, blocks: Block[]): string {
  const rows: string[] = [];
  let t = 0;
  for (const s of flatten(blocks)) {
    const pctStart = Math.round((s.kind === "cooldown" ? s.high : s.low) * 100);
    const pctEnd = Math.round((s.kind === "cooldown" ? s.low : s.kind === "warmup" ? s.high : s.low) * 100);
    const p = s.kind === "sprint" ? 150 : s.kind === "warmup" || s.kind === "cooldown" ? null : Math.round(mid(s) * 100);
    const a = p ?? pctStart, z = p ?? pctEnd;
    rows.push(`${(t / 60).toFixed(2)}\t${a}`);
    t += s.durationS;
    rows.push(`${(t / 60).toFixed(2)}\t${z}`);
  }
  return `[COURSE HEADER]
VERSION = 2
UNITS = ENGLISH
DESCRIPTION = ${description.replace(/\n/g, " ")}
FILE NAME = ${title}
MINUTES PERCENT
[END COURSE HEADER]
[COURSE DATA]
${rows.join("\n")}
[END COURSE DATA]
`;
}

/** FIT workout. refWatts présent → cibles en watts absolus ; sinon en % de la FTP du compteur. */
export function toFitWorkout(title: string, blocks: Block[], refWatts: number | null): Uint8Array {
  const enc = new Encoder();
  enc.onMesg(Profile.MesgNum.FILE_ID, <AnyMesg>{ manufacturer: "development", product: 0, timeCreated: new Date(), type: "workout", serialNumber: 1 });
  const steps: Record<string, unknown>[] = [];
  const power = (x: number) => (refWatts ? Math.round(x * refWatts) + 1000 : Math.round(x * 100));
  const stepMesg = (s: Step) => {
    const base: Record<string, unknown> = {
      messageIndex: steps.length,
      wktStepName: (s.label ?? s.kind).slice(0, 15),
      durationType: "time",
      durationValue: Math.round(s.durationS * 1000), // champ principal (ms) ; sous-champ durationTime en s
      intensity: s.kind === "warmup" ? "warmup" : s.kind === "cooldown" ? "cooldown" : s.kind === "recovery" ? "recovery" : s.kind === "steady" ? "active" : "interval",
    };
    if (s.kind === "sprint") Object.assign(base, { targetType: "open" });
    else Object.assign(base, { targetType: "power", targetValue: 0, customTargetValueLow: power(s.low), customTargetValueHigh: power(s.high) });
    steps.push(base);
  };
  for (const b of blocks) {
    if (isRepeat(b)) {
      const first = steps.length;
      b.steps.forEach(stepMesg);
      steps.push({ messageIndex: steps.length, durationType: "repeatUntilStepsCmplt", durationValue: first, targetType: "open", targetValue: b.count });
    } else stepMesg(b);
  }
  enc.onMesg(Profile.MesgNum.WORKOUT, <AnyMesg>{ wktName: title.slice(0, 30), sport: "cycling", subSport: "generic", numValidSteps: steps.length });
  for (const s of steps) enc.onMesg(Profile.MesgNum.WORKOUT_STEP, s as AnyMesg);
  return enc.close();
}
