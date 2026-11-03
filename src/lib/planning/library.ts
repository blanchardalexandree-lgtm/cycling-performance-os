import type { Block, Intensity, Step, WorkoutSpec } from "./types";
import { totalDurationS } from "./types";

/**
 * Bibliothèque de séances. Chaque modèle sait s'adapter au temps disponible :
 * build(minutes) ajuste le nombre de répétitions / la durée d'endurance, ou renvoie null
 * si l'objectif physiologique ne tient pas dans le créneau (le planificateur choisit alors
 * une variante courte cohérente plutôt que de « bourrer » la séance).
 */
export interface Template {
  id: string;
  title: string;
  category: string;
  intensity: Intensity;
  key: boolean;
  minMin: number;
  idealMin: number;
  maxMin: number;
  objective: string;
  rationale: string;
  successCriteria: string[];
  adaptations: string[];
  technique?: string;
  indoorFriendly: boolean;
  build: (minutes: number) => Block[] | null;
}

const m = (x: number) => Math.round(x * 60);
const st = (kind: Step["kind"], min: number, low: number, high: number, rpe: number, extra: Partial<Step> = {}): Step => ({
  kind, durationS: m(min), low, high, rpe, ...extra,
});
const WU = (min = 15): Step => st("warmup", min, 0.5, 0.7, 3, { label: "Échauffement progressif" });
const CD = (min = 10): Step => st("cooldown", min, 0.45, 0.6, 2, { label: "Retour au calme" });
const END = (min: number, low = 0.6, high = 0.72): Step => st("steady", min, low, high, 3, { label: "Endurance", cadence: [85, 95] });

/** Construit : échauffement + séries (nombre ajusté) + endurance de remplissage + retour au calme. */
function intervalSession(minutes: number, opts: { wu?: number; cd?: number; repMin: number; minReps: number; maxReps: number; set: (n: number) => Block; fillLow?: number; fillHigh?: number }) {
  const wu = opts.wu ?? 15, cd = opts.cd ?? 10;
  const budget = minutes - wu - cd;
  const reps = Math.min(opts.maxReps, Math.floor(budget / opts.repMin));
  if (reps < opts.minReps) return null;
  const main = opts.set(reps);
  const used = wu + cd + totalDurationS([main]) / 60;
  const fill = Math.floor(minutes - used);
  const blocks: Block[] = [WU(wu), main];
  if (fill >= 5) blocks.push(END(fill, opts.fillLow, opts.fillHigh));
  blocks.push(CD(cd));
  return blocks;
}

export const TEMPLATES: Template[] = [
  {
    id: "recup_active", title: "Récupération active", category: "recuperation", intensity: "low", key: false,
    minMin: 20, idealMin: 50, maxMin: 75, indoorFriendly: true,
    objective: "Favoriser la récupération en gardant le contact avec le vélo, sans créer de fatigue.",
    rationale: "Jour 4 du cycle : charge minimale. Intensité très basse, aucun travail structuré.",
    successCriteria: ["Puissance sous 55 % de la référence", "FC en zone 1", "Sensation de jambes plus légères en fin de sortie"],
    adaptations: ["Raccourcir à 20-30 min si fatigue élevée", "Remplacer par une journée sans vélo si malade ou douleur inhabituelle"],
    technique: "Petit braquet, cadence souple 85-95 rpm, terrain plat. Pas de relance.",
    build: (min) => [st("steady", Math.max(20, min), 0.4, 0.55, 2, { label: "Très facile", cadence: [85, 95] })],
  },
  {
    id: "endurance", title: "Endurance fondamentale", category: "endurance", intensity: "low", key: false,
    minMin: 45, idealMin: 120, maxMin: 240, indoorFriendly: true,
    objective: "Développer la capacité aérobie et l'efficacité métabolique.",
    rationale: "Volume à faible intensité : base de toutes les qualités, faible coût de récupération.",
    successCriteria: ["≥ 85 % du temps en zone 2", "Découplage Pw:HR < 5 % si > 90 min"],
    adaptations: ["Sur home trainer : réduire de 25 % la durée", "Peut absorber un court travail de cadence"],
    technique: "Cadence 85-95 rpm, alimentation toutes les 30-40 min au-delà de 90 min.",
    build: (min) => [WU(10), END(Math.max(25, min - 15)), CD(5)],
  },
  {
    id: "endurance_longue", title: "Sortie longue", category: "endurance", intensity: "moderate", key: false,
    minMin: 150, idealMin: 210, maxMin: 330, indoorFriendly: false,
    objective: "Endurance de longue durée et résistance à la fatigue (durabilité).",
    rationale: "Reproduire la durée des courses en ligne ; 2-3 blocs tempo en fin pour travailler la durabilité.",
    successCriteria: ["Puissance des blocs tempo tenue en fin de sortie", "Alimentation 60-90 g/h glucides"],
    adaptations: ["Sans les blocs tempo en période de récupération relative"],
    build: (min) => {
      if (min < 150) return null;
      return [WU(15), END(min - 15 - 10 - 45), { kind: "repeat", count: 2, steps: [st("interval", 15, 0.78, 0.85, 6, { label: "Tempo", cadence: [85, 95] }), st("recovery", 7.5, 0.55, 0.65, 3)] }, CD(10)];
    },
  },
  {
    id: "tempo", title: "Tempo", category: "tempo", intensity: "moderate", key: false,
    minMin: 60, idealMin: 105, maxMin: 180, indoorFriendly: true,
    objective: "Endurance de haute intensité aérobie, tolérance à l'effort prolongé.",
    rationale: "Séance complémentaire : stimulus aérobie notable pour un coût de récupération modéré.",
    successCriteria: ["Puissance stable 76-87 % sur chaque bloc", "FC stable (dérive < 5 %)"],
    adaptations: ["Fractionner en blocs de 10 min si le temps manque"],
    build: (min) => intervalSession(min, { repMin: 25, minReps: 2, maxReps: 3, set: (n) => ({ kind: "repeat", count: n, steps: [st("interval", 20, 0.78, 0.86, 6, { label: "Tempo", cadence: [85, 95] }), st("recovery", 5, 0.5, 0.6, 2)] }) }),
  },
  {
    id: "sweetspot", title: "Sweet spot", category: "sweetspot", intensity: "moderate", key: true,
    minMin: 60, idealMin: 90, maxMin: 150, indoorFriendly: true,
    objective: "Élever la puissance au seuil avec un bon rapport stimulus / fatigue.",
    rationale: "88-93 % de la référence : travail sous-seuil soutenu, adapté au développement général.",
    successCriteria: ["Blocs tenus dans la cible sans baisse > 3 %", "RPE ≤ 7"],
    adaptations: ["Durée de bloc 10-20 min selon le temps", "Position CLM possible sur le dernier bloc"],
    build: (min) => intervalSession(min, { repMin: 17, minReps: 2, maxReps: 4, set: (n) => ({ kind: "repeat", count: n, steps: [st("interval", 12, 0.88, 0.93, 7, { label: "Sweet spot", cadence: [85, 95] }), st("recovery", 5, 0.5, 0.6, 2)] }) }),
  },
  {
    id: "seuil", title: "Seuil", category: "seuil", intensity: "high", key: true,
    minMin: 50, idealMin: 90, maxMin: 130, indoorFriendly: true,
    objective: "Augmenter la puissance soutenable ~40-60 min (FTP / puissance critique).",
    rationale: "Séance de développement prioritaire pour un spécialiste du contre-la-montre.",
    successCriteria: ["Moyenne de chaque bloc dans 95-102 %", "Dernier bloc au moins aussi fort que le premier"],
    adaptations: ["2 × 10 min si 60 min disponibles", "Arrêter la série si la puissance chute de > 5 %"],
    technique: "Cadence proche de la cadence de course (90-100 rpm). Position CLM sur au moins un bloc en phase spécifique.",
    build: (min) => intervalSession(min, { wu: min < 60 ? 12 : 15, cd: min < 60 ? 8 : 10, repMin: 15, minReps: 2, maxReps: 4, set: (n) => ({ kind: "repeat", count: n, steps: [st("interval", 10, 0.95, 1.02, 8, { label: "Seuil", cadence: [90, 100] }), st("recovery", 5, 0.5, 0.6, 2)] }) }),
  },
  {
    id: "vo2", title: "VO2max — 5 × 4 min", category: "vo2", intensity: "high", key: true,
    minMin: 55, idealMin: 75, maxMin: 100, indoorFriendly: true,
    objective: "Développer la consommation maximale d'oxygène et la puissance aérobie maximale.",
    rationale: "Intervalles de 3-5 min à 106-120 % : stimulus central majeur pour le plafond aérobie.",
    successCriteria: ["Chaque répétition ≥ 106 % de la référence", "FC > 90 % FCmax en fin de répétition"],
    adaptations: ["4 × 3 min en affûtage", "Réduire à 4 répétitions si la puissance chute de > 5 %"],
    build: (min) => intervalSession(min, { wu: 20, repMin: 8, minReps: 3, maxReps: 6, set: (n) => ({ kind: "repeat", count: n, steps: [st("interval", 4, 1.08, 1.18, 9, { label: "PMA", cadence: [95, 105] }), st("recovery", 4, 0.45, 0.55, 2)] }) }),
  },
  {
    id: "pma_30_15", title: "PMA — 30/15", category: "vo2", intensity: "high", key: true,
    minMin: 60, idealMin: 75, maxMin: 95, indoorFriendly: true,
    objective: "Accumuler du temps à haute consommation d'oxygène (protocole type Rønnestad).",
    rationale: "Les micro-intervalles 30/15 maintiennent une VO2 élevée avec une puissance supérieure à la PMA continue.",
    successCriteria: ["Puissance moyenne des 30 s ≥ 120 %", "Séries homogènes"],
    adaptations: ["2 séries au lieu de 3 si fatigue", "Récupération de 3 min entre séries"],
    build: (min) => intervalSession(min, { wu: 20, repMin: 13, minReps: 2, maxReps: 3, set: (n) => ({ kind: "repeat", count: n, steps: [...Array.from({ length: 13 }, () => [st("interval", 0.5, 1.2, 1.35, 9, { label: "30 s" }), st("recovery", 0.25, 0.45, 0.55, 3)]).flat(), st("recovery", 3, 0.45, 0.55, 2)] }) }),
  },
  {
    id: "over_under", title: "Au-dessus de la CP — over/under", category: "anaerobie", intensity: "high", key: true,
    minMin: 60, idealMin: 80, maxMin: 110, indoorFriendly: true,
    objective: "Travailler au-dessus de la puissance critique et la capacité à évacuer la fatigue (W′).",
    rationale: "Alternance 105-110 % / 90-95 % : reproduit les relances et prépare les changements de rythme.",
    successCriteria: ["Phases « over » tenues", "Phases « under » sans retomber sous 88 %"],
    adaptations: ["2 blocs en période chargée"],
    build: (min) => intervalSession(min, { repMin: 16, minReps: 2, maxReps: 4, set: (n) => ({ kind: "repeat", count: n, steps: [...Array.from({ length: 4 }, () => [st("interval", 2, 0.9, 0.95, 7, { label: "Under" }), st("interval", 1, 1.05, 1.1, 9, { label: "Over" })]).flat(), st("recovery", 4, 0.45, 0.55, 2)] }) }),
  },
  {
    id: "anaerobie", title: "Capacité anaérobie — 6 × 1 min", category: "anaerobie", intensity: "high", key: true,
    minMin: 60, idealMin: 75, maxMin: 100, indoorFriendly: true,
    objective: "Puissance anaérobie et tolérance lactique pour les attaques et bordures.",
    rationale: "Efforts courts > 130 % sur récupération longue, pertinents en préparation de courses en ligne.",
    successCriteria: ["Puissance moyenne de 1 min ≥ 130 %", "Baisse < 10 % entre la 1re et la dernière"],
    adaptations: ["4 répétitions si fatigue"],
    build: (min) => intervalSession(min, { wu: 20, repMin: 5, minReps: 4, maxReps: 8, set: (n) => ({ kind: "repeat", count: n, steps: [st("interval", 1, 1.3, 1.5, 10, { label: "1 min" }), st("recovery", 4, 0.45, 0.55, 2)] }) }),
  },
  {
    id: "sprint", title: "Sprint et puissance neuromusculaire", category: "sprint", intensity: "moderate", key: false,
    minMin: 60, idealMin: 90, maxMin: 150, indoorFriendly: false,
    objective: "Entretenir la puissance maximale et la coordination neuromusculaire.",
    rationale: "Sprints très courts (8-12 s) avec récupération complète : peu de fatigue métabolique.",
    successCriteria: ["Pic de puissance proche des records", "Récupération complète entre sprints"],
    adaptations: ["Départ arrêté ou lancé selon l'objectif"],
    build: (min) => intervalSession(min, { repMin: 5, minReps: 5, maxReps: 8, set: (n) => ({ kind: "repeat", count: n, steps: [st("sprint", 10 / 60, 2.0, 3.0, 10, { label: "Sprint max", cadence: [100, 130] }), st("recovery", 5 - 10 / 60, 0.5, 0.6, 2)] }) }),
  },
  {
    id: "repetition", title: "Répétition d'efforts", category: "repetition", intensity: "high", key: true,
    minMin: 60, idealMin: 80, maxMin: 110, indoorFriendly: true,
    objective: "Capacité à répéter des efforts intenses (attaques, bordures, relances).",
    rationale: "Séries de 20/40 : sollicitation de W′ et de sa reconstitution.",
    successCriteria: ["Puissance des 20 s stable sur la série"],
    adaptations: ["2 séries si fatigue"],
    build: (min) => intervalSession(min, { repMin: 11, minReps: 2, maxReps: 4, set: (n) => ({ kind: "repeat", count: n, steps: [...Array.from({ length: 8 }, () => [st("interval", 1 / 3, 1.4, 1.7, 9, { label: "20 s" }), st("recovery", 2 / 3, 0.5, 0.6, 3)]).flat(), st("recovery", 3, 0.45, 0.55, 2)] }) }),
  },
  {
    id: "clm_specifique", title: "Spécifique contre-la-montre", category: "clm", intensity: "high", key: true,
    minMin: 70, idealMin: 100, maxMin: 140, indoorFriendly: true,
    objective: "Tenir l'allure cible de CLM en position aérodynamique et automatiser le pacing.",
    rationale: "Blocs à l'allure objectif (96-102 %) sur le vélo de CLM : spécificité position + intensité.",
    successCriteria: ["VI ≤ 1,03 sur chaque bloc", "Position maintenue > 95 % du temps", "Cadence stable 90-100 rpm"],
    adaptations: ["Sur home trainer avec le vélo de CLM", "2 × 12 min en affûtage"],
    technique: "Vélo de CLM, regard bas, épaules relâchées. Départ maîtrisé : 1re minute ≤ 105 %.",
    build: (min) => intervalSession(min, { repMin: 25, minReps: 2, maxReps: 3, set: (n) => ({ kind: "repeat", count: n, steps: [st("interval", 20, 0.96, 1.02, 8, { label: "Allure CLM — position", cadence: [90, 100] }), st("recovery", 5, 0.5, 0.6, 2)] }) }),
  },
  {
    id: "force", title: "Force — basse cadence", category: "force", intensity: "moderate", key: false,
    minMin: 60, idealMin: 90, maxMin: 150, indoorFriendly: true,
    objective: "Développer la force spécifique sur le vélo.",
    rationale: "Efforts sous-maximaux à 50-60 rpm : stimulus musculaire sans coût métabolique élevé.",
    successCriteria: ["Cadence maintenue 50-60 rpm", "Aucune douleur articulaire (genoux)"],
    adaptations: ["Supprimer en cas de gêne aux genoux"],
    technique: "Buste stable, assis, montée ou home trainer. Arrêter au moindre signal douloureux.",
    build: (min) => intervalSession(min, { repMin: 10, minReps: 3, maxReps: 6, set: (n) => ({ kind: "repeat", count: n, steps: [st("interval", 6, 0.8, 0.88, 6, { label: "Force", cadence: [50, 60] }), st("recovery", 4, 0.5, 0.6, 2)] }) }),
  },
  {
    id: "cadence", title: "Vélocité", category: "cadence", intensity: "low", key: false,
    minMin: 45, idealMin: 75, maxMin: 120, indoorFriendly: true,
    objective: "Améliorer la fluidité et l'efficacité du pédalage à haute cadence.",
    rationale: "Travail technique à faible intensité, compatible avec une journée complémentaire.",
    successCriteria: ["Cadence 105-115 rpm sans rebond sur la selle"],
    adaptations: ["Peut s'intégrer à une endurance"],
    build: (min) => intervalSession(min, { repMin: 6, minReps: 4, maxReps: 8, set: (n) => ({ kind: "repeat", count: n, steps: [st("interval", 3, 0.65, 0.75, 4, { label: "Vélocité", cadence: [105, 115] }), st("recovery", 3, 0.55, 0.65, 3)] }) }),
  },
  {
    id: "opener", title: "Déblocage veille de course", category: "activation", intensity: "moderate", key: false,
    minMin: 40, idealMin: 60, maxMin: 75, indoorFriendly: true,
    objective: "Arriver frais et réactif le lendemain.",
    rationale: "Veille de course : volume faible, quelques rappels d'intensité courts.",
    successCriteria: ["Sensation de jambes réactives", "Aucune fatigue ajoutée"],
    adaptations: ["Sur le vélo de course du lendemain (CLM : vélo de CLM)"],
    build: (min) => ([WU(15), { kind: "repeat" as const, count: 3, steps: [st("interval", 1, 1.0, 1.08, 7, { label: "Rappel seuil+" }), st("recovery", 3, 0.5, 0.6, 2)] }, { kind: "repeat" as const, count: 3, steps: [st("sprint", 8 / 60, 1.8, 2.5, 9, { label: "Sprint 8 s" }), st("recovery", 2, 0.5, 0.6, 2)] }, END(Math.max(0, min - 15 - 12 - 6.4 - 8)), CD(8)] as Block[]).filter((b) => b.kind === "repeat" || (b as Step).durationS > 0),
  },
  {
    id: "test_20", title: "Test — 20 min", category: "test", intensity: "high", key: true,
    minMin: 70, idealMin: 75, maxMin: 90, indoorFriendly: true,
    objective: "Mesurer la puissance maximale sur 20 min et actualiser les références.",
    rationale: "Aucune référence de puissance mesurée récente : sans elle, les cibles en watts ne sont pas fiables.",
    successCriteria: ["Effort réellement maximal et régulier", "Conditions notées (home trainer/extérieur, capteur, chaleur)"],
    adaptations: ["Reporter si fatigue ou mauvais sommeil : un test raté fausse les références"],
    technique: "Protocole reproductible : même capteur, même lieu ou home trainer, même heure, même échauffement. Pacing : démarrer à l'allure estimée, accélérer dans les 5 dernières minutes.",
    build: () => [WU(20), st("interval", 5, 1.1, 1.2, 9, { label: "5 min dynamique (ouverture)" }), st("recovery", 10, 0.5, 0.6, 2), st("interval", 20, 1.0, 1.05, 10, { label: "20 min MAX" }), CD(15)],
  },
  {
    id: "test_cp", title: "Test — puissance critique (3 + 12 min)", category: "test", intensity: "high", key: true,
    minMin: 75, idealMin: 80, maxMin: 95, indoorFriendly: true,
    objective: "Deux efforts maximaux pour estimer CP et W′ (modèle 2 paramètres).",
    rationale: "Modèle CP plus robuste qu'un facteur fixe appliqué au test de 20 min.",
    successCriteria: ["Deux efforts réellement maximaux", "30 min de récupération entre les deux"],
    adaptations: ["Peut être réparti sur deux jours"],
    build: () => [WU(20), st("interval", 3, 1.15, 1.3, 10, { label: "3 min MAX" }), st("recovery", 30, 0.45, 0.55, 2), st("interval", 12, 1.0, 1.08, 10, { label: "12 min MAX" }), CD(10)],
  },
];

export const TEMPLATE_BY_ID = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));

/** Variantes courtes : objectif physiologique conservé quand le temps manque. */
const SHORT_FALLBACK: Record<string, string> = {
  endurance_longue: "endurance",
  seuil: "sweetspot",
  clm_specifique: "seuil",
  vo2: "pma_30_15",
  tempo: "endurance",
  sprint: "cadence",
};

export function buildWorkout(templateId: string, minutes: number): WorkoutSpec | null {
  let t: Template | undefined = TEMPLATE_BY_ID[templateId];
  let blocks: Block[] | null = null;
  const seen = new Set<string>();
  while (t && !seen.has(t.id)) {
    seen.add(t.id);
    const target = Math.min(t.maxMin, minutes);
    blocks = target >= t.minMin ? t.build(target) : null;
    if (blocks) break;
    const fb: string | undefined = SHORT_FALLBACK[t.id];
    t = fb ? TEMPLATE_BY_ID[fb] : undefined;
  }
  if (!t || !blocks) return null;
  return {
    templateId: t.id, title: t.title, category: t.category, objective: t.objective, rationale: t.rationale,
    successCriteria: t.successCriteria, adaptations: t.adaptations, technique: t.technique, intensity: t.intensity,
    priority: t.key ? 1 : t.intensity === "low" ? 3 : 2, indoorFriendly: t.indoorFriendly, blocks,
  };
}
