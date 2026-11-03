/**
 * Estimation EXPÉRIMENTALE du CdA par la méthode de l'élévation virtuelle (R. Chung).
 *
 * Modèle : P·η = m·g·v·(Crr + pente) + m·v·a + ½·ρ·CdA·v³ (vent nul supposé).
 * On reconstruit l'altitude « virtuelle » pour un CdA donné et on choisit le CdA qui
 * minimise l'écart avec l'altitude mesurée. Incertitude : balayage Crr ± 0,001 et ρ ± 2 %.
 *
 * Conditions requises (sinon refus) : flux 1 Hz vitesse + puissance + altitude, ≥ 5 min,
 * peu d'arrêts, idéalement parcours en boucle / aller-retour, sans vent, sans freinage.
 * Ne JAMAIS déduire un CdA de la seule puissance moyenne et vitesse moyenne.
 */
export interface AeroInput {
  power: number[]; // W, 1 Hz
  speed: number[]; // m/s, 1 Hz
  altitude: number[]; // m, 1 Hz
  massKg: number; // cycliste + vélo
  crr?: number;
  rho?: number; // kg/m³
  drivetrainEff?: number;
}

export interface AeroResult {
  cda: number;
  low: number;
  high: number;
  rmseM: number;
  samples: number;
  assumptions: string[];
}

const G = 9.80665;

function virtualElevationRmse(inp: Required<AeroInput>, cda: number): number {
  const { power, speed, altitude, massKg, crr, rho, drivetrainEff } = inp;
  let ve = altitude[0];
  let se = 0;
  let n = 0;
  for (let i = 1; i < speed.length; i++) {
    const v = Math.max(speed[i], 0.1);
    const a = speed[i] - speed[i - 1];
    const slope = (power[i] * drivetrainEff) / (massKg * G * v) - crr - a / G - (0.5 * rho * cda * v * v) / (massKg * G);
    ve += slope * v; // dt = 1 s
    se += (ve - altitude[i]) ** 2;
    n++;
  }
  return Math.sqrt(se / n);
}

export function checkAeroData(inp: AeroInput): string | null {
  const n = Math.min(inp.power.length, inp.speed.length, inp.altitude.length);
  if (n < 300) return "Moins de 5 minutes de données synchronisées vitesse/puissance/altitude.";
  const stops = inp.speed.filter((v) => v < 2).length / n;
  if (stops > 0.1) return "Trop d'arrêts ou de passages lents (> 10 % du temps sous 7 km/h).";
  if (inp.altitude.every((a) => a === inp.altitude[0])) return "Altitude absente ou constante.";
  return null;
}

function bestCda(inp: Required<AeroInput>): { cda: number; rmse: number } {
  let best = { cda: 0.2, rmse: Infinity };
  for (let c = 0.15; c <= 0.5; c += 0.001) {
    const r = virtualElevationRmse(inp, c);
    if (r < best.rmse) best = { cda: c, rmse: r };
  }
  return best;
}

export function estimateCda(input: AeroInput): AeroResult | { error: string } {
  const err = checkAeroData(input);
  if (err) return { error: err };
  const base: Required<AeroInput> = { crr: 0.004, rho: 1.2, drivetrainEff: 0.976, ...input } as Required<AeroInput>;
  const main = bestCda(base);
  const variants = [
    { ...base, crr: base.crr - 0.001 }, { ...base, crr: base.crr + 0.001 },
    { ...base, rho: base.rho * 0.98 }, { ...base, rho: base.rho * 1.02 },
  ].map((v) => bestCda(v).cda);
  return {
    cda: Math.round(main.cda * 1000) / 1000,
    low: Math.round(Math.min(...variants, main.cda) * 1000) / 1000,
    high: Math.round(Math.max(...variants, main.cda) * 1000) / 1000,
    rmseM: Math.round(main.rmse * 100) / 100,
    samples: input.speed.length,
    assumptions: [
      `Crr supposé ${base.crr} (± 0,001)`, `ρ air ${base.rho} kg/m³ (± 2 %)`, `rendement transmission ${base.drivetrainEff}`,
      "vent nul supposé", `masse totale ${input.massKg} kg`,
    ],
  };
}
