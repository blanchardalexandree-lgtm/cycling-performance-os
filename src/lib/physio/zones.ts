/** Zones de puissance (Coggan, % FTP) et de FC (% LTHR, Friel simplifié). */
export const POWER_ZONES = [
  { id: "Z1", name: "Récupération active", low: 0, high: 0.55 },
  { id: "Z2", name: "Endurance", low: 0.56, high: 0.75 },
  { id: "Z3", name: "Tempo", low: 0.76, high: 0.87 },
  { id: "SS", name: "Sweet spot", low: 0.88, high: 0.94 },
  { id: "Z4", name: "Seuil", low: 0.95, high: 1.05 },
  { id: "Z5", name: "VO2max", low: 1.06, high: 1.2 },
  { id: "Z6", name: "Anaérobie", low: 1.21, high: 1.5 },
  { id: "Z7", name: "Neuromusculaire", low: 1.51, high: 9 },
] as const;

export const HR_ZONES = [
  { id: "Z1", name: "Récupération", low: 0, high: 0.81 },
  { id: "Z2", name: "Endurance", low: 0.81, high: 0.89 },
  { id: "Z3", name: "Tempo", low: 0.9, high: 0.93 },
  { id: "Z4", name: "Sous-seuil", low: 0.94, high: 0.99 },
  { id: "Z5", name: "Seuil et +", low: 1.0, high: 1.2 },
] as const;

export function powerZoneOf(watts: number, ftp: number) {
  const r = watts / ftp;
  return POWER_ZONES.find((z) => r <= z.high) ?? POWER_ZONES[POWER_ZONES.length - 1];
}

export function timeInPowerZones(power: number[], ftp: number): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(POWER_ZONES.map((z) => [z.id, 0]));
  for (const p of power) out[powerZoneOf(p, ftp).id]++;
  return out;
}
