export interface ParsedActivity {
  name?: string;
  sport: string; // cycling, running, other
  subSport?: string;
  startTime: Date;
  elapsedS: number;
  movingS?: number;
  distanceM?: number;
  elevationGainM?: number;
  indoor?: boolean;
  device?: string;
  powerSensorId?: string;
  /** Échantillons bruts (temps en secondes depuis le début). */
  samples: {
    t: number[];
    power: (number | null)[];
    hr: (number | null)[];
    cadence: (number | null)[];
    speed: (number | null)[];
    altitude: (number | null)[];
    distance: (number | null)[];
    lat: (number | null)[];
    lng: (number | null)[];
  };
}

export function emptySamples(): ParsedActivity["samples"] {
  return { t: [], power: [], hr: [], cadence: [], speed: [], altitude: [], distance: [], lat: [], lng: [] };
}

export class ImportError extends Error {}
