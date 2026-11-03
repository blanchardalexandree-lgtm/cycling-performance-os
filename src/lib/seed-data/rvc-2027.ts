/**
 * Calendrier RVC saison 2027 (source : Google Sheet « lmp RVC 2026 », onglet Calendrier2027).
 * Priorités proposées par défaut, modifiables dans Objectifs :
 *  A = championnats de France (CLM + route) ; B = régional, courses UCI, Plages Vendéennes CLM,
 *  courses à étapes majeures ; C = le reste. « stage » = stage d'entraînement (pas une course).
 */
export interface SeedEvent {
  name: string;
  date: string;
  endDate?: string;
  kind: "course" | "clm" | "etapes" | "stage";
  priority: "A" | "B" | "C";
  confirmed?: boolean;
  demands?: string[];
}

export const RVC_2027: SeedEvent[] = [
  { name: "Stage Cohésion RVC", date: "2026-11-07", endDate: "2026-11-08", kind: "stage", priority: "C" },
  { name: "Stage N2", date: "2026-12-05", endDate: "2026-12-06", kind: "stage", priority: "C" },
  { name: "Stage RVC + repas club", date: "2027-01-17", endDate: "2027-01-18", kind: "stage", priority: "C" },
  { name: "Stage Espagne Lloret de Mar", date: "2027-01-23", endDate: "2027-01-31", kind: "stage", priority: "C" },
  { name: "Plages Vendéennes – Maché", date: "2027-02-13", kind: "course", priority: "C" },
  { name: "Plages Vendéennes – Notre-Dame-de-Monts", date: "2027-02-14", kind: "course", priority: "C" },
  { name: "Plages Vendéennes – Moutiers", date: "2027-02-19", kind: "course", priority: "C" },
  { name: "Plages Vendéennes – Challans CLM", date: "2027-02-20", kind: "clm", priority: "B", demands: ["clm", "seuil"] },
  { name: "Plages Vendéennes – St-Hilaire-de-Riez", date: "2027-02-21", kind: "course", priority: "C" },
  { name: "Manche Atlantique", date: "2027-03-07", kind: "course", priority: "C" },
  { name: "Circuit du Morbihan", date: "2027-03-14", kind: "course", priority: "C" },
  { name: "Flèche de Locminé", date: "2027-03-21", kind: "course", priority: "C" },
  { name: "Classic Loire-Atlantique (UCI 1.2)", date: "2027-03-27", kind: "course", priority: "B" },
  { name: "Bordeaux – Saintes", date: "2027-03-28", kind: "course", priority: "C" },
  { name: "Tour du Pays de Lesneven", date: "2027-04-03", endDate: "2027-04-04", kind: "etapes", priority: "C" },
  { name: "Le Mené U23", date: "2027-04-05", kind: "course", priority: "C" },
  { name: "Redon – Redon", date: "2027-04-11", kind: "course", priority: "C" },
  { name: "Tour de Charente-Maritime", date: "2027-05-06", endDate: "2027-05-09", kind: "etapes", priority: "B" },
  { name: "Essor Breton", date: "2027-05-21", endDate: "2027-05-24", kind: "etapes", priority: "B" },
  { name: "Tour de Loire-Atlantique", date: "2027-05-31", kind: "course", priority: "C" },
  { name: "Championnat régional", date: "2027-06-06", kind: "course", priority: "B", confirmed: false },
  { name: "Route Vendéenne", date: "2027-06-11", endDate: "2027-06-13", kind: "etapes", priority: "B" },
  { name: "Sportbreizh", date: "2027-06-20", kind: "course", priority: "C" },
  { name: "Championnat de France CLM", date: "2027-06-25", kind: "clm", priority: "A", demands: ["clm", "seuil", "pacing"] },
  { name: "Championnat de France", date: "2027-06-26", kind: "course", priority: "A", demands: ["répétition d'efforts", "endurance"] },
  { name: "Manche Océan", date: "2027-07-04", kind: "course", priority: "C" },
  { name: "Tour des Deux-Sèvres", date: "2027-07-11", endDate: "2027-07-14", kind: "etapes", priority: "B" },
  { name: "Stage RVC", date: "2027-07-18", endDate: "2027-07-19", kind: "stage", priority: "C" },
  { name: "GP de Pérenchies (UCI 1.2)", date: "2027-07-26", kind: "course", priority: "B" },
  { name: "Challenge Mayennais", date: "2027-08-01", endDate: "2027-08-03", kind: "etapes", priority: "C" },
  { name: "L'Estivale Bretonne", date: "2027-08-07", endDate: "2027-08-10", kind: "etapes", priority: "B" },
  { name: "St-Georges-sur-Loire", date: "2027-08-15", kind: "course", priority: "C" },
  { name: "Le Pertre", date: "2027-08-17", kind: "course", priority: "C" },
  { name: "Agglo Tour St-Brieuc", date: "2027-08-22", endDate: "2027-08-23", kind: "etapes", priority: "C" },
  { name: "Jard – Les Herbiers", date: "2027-09-09", kind: "course", priority: "C" },
  { name: "Ronde de la Mayenne", date: "2027-09-13", kind: "course", priority: "C" },
  { name: "Tour de Rhuys", date: "2027-09-20", kind: "course", priority: "C" },
  { name: "Paris – Vierzon", date: "2027-09-26", kind: "course", priority: "C" },
  { name: "Bol d'Or", date: "2027-10-01", kind: "course", priority: "C", confirmed: false },
  { name: "Trophée des Champions", date: "2027-10-02", kind: "course", priority: "C", confirmed: false },
  { name: "Paris – Connéré", date: "2027-10-03", kind: "course", priority: "C" },
];
