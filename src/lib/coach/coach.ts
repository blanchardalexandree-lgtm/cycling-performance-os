/**
 * Coach IA : modèle de langage (API Anthropic, configurable) + outils internes.
 * Le modèle raisonne et explique ; les chiffres viennent des outils déterministes.
 * Sans ANTHROPIC_API_KEY : mode démonstration explicitement signalé (réponses calculées
 * par des règles simples à partir des mêmes outils, sans modèle de langage).
 */
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../db";
import { TOOLS, runTool } from "./tools";

export const coachEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);
const MODEL = () => process.env.COACH_MODEL || "claude-opus-5-5";
const MAX_TOOL_ROUNDS = 8;

const SYSTEM = `Tu es le directeur de performance d'un coureur cycliste sur route de haut niveau amateur (division nationale), spécialiste du contre-la-montre, étudiant en kinésithérapie. Tu réponds en français, de façon précise, concise et argumentée.

Règles impératives :
- N'invente aucune donnée. Tout chiffre (puissance, charge, dates, records) doit provenir d'un outil. Si une donnée manque, dis-le et propose le test ou la saisie qui la fournirait.
- Distingue toujours : données observées, estimations (avec leur méthode et incertitude), hypothèses, et tes recommandations.
- Ne présente jamais une FTP, PMA ou CP estimée comme une mesure.
- Ne te fie jamais à un seul indicateur pour juger la fatigue ; utilise get_readiness et get_training_load.
- Le plan suit un cycle de référence 3 jours d'entraînement + 1 jour de récupération active à vélo. Une journée sans vélo n'est recommandée qu'en cas de maladie, douleur ou fatigue avérée.
- Ne compense jamais une séance manquée en surchargeant les jours suivants.
- Tu ne modifies jamais le plan directement : utilise propose_plan_change, puis explique ce que l'athlète doit valider dans l'application.
- Douleur inhabituelle, symptômes de maladie : recommande la prudence et l'avis d'un professionnel de santé.
- Certaines activités importées de Strava ne te sont pas accessibles (politique Strava) ; signale-le si cela limite ton analyse.`;

export interface CoachReply {
  mode: "live" | "demo";
  text: string;
  toolsUsed: string[];
}

export async function askCoach(userId: string, question: string): Promise<CoachReply> {
  const history = await prisma.coachMessage.findMany({ where: { userId, mode: coachEnabled() ? "live" : "demo" }, orderBy: { createdAt: "desc" }, take: 12 });
  await prisma.coachMessage.create({ data: { userId, role: "user", content: question, mode: coachEnabled() ? "live" : "demo" } });
  const reply = coachEnabled() ? await live(userId, question, history.reverse()) : await demo(userId, question);
  await prisma.coachMessage.create({ data: { userId, role: "assistant", content: reply.text, mode: reply.mode } });
  return reply;
}

async function live(userId: string, question: string, history: { role: string; content: string }[]): Promise<CoachReply> {
  const client = new Anthropic();
  const today = new Date().toISOString().slice(0, 10);
  const messages: Anthropic.MessageParam[] = [
    ...history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
    { role: "user", content: `[Date du jour : ${today}]\n${question}` },
  ];
  const used: string[] = [];
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await client.messages.create({
      model: MODEL(),
      max_tokens: 16000,
      system: SYSTEM,
      tools: TOOLS.map((t) => t.def),
      output_config: { effort: "medium" },
      messages,
    });
    if (res.stop_reason === "refusal") return { mode: "live", text: "Le modèle a décliné cette demande. Reformule ta question en restant sur l'entraînement.", toolsUsed: used };
    messages.push({ role: "assistant", content: res.content });
    const calls = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || calls.length === 0) {
      const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
      return { mode: "live", text: text || "(réponse vide)", toolsUsed: used };
    }
    const results = await Promise.all(
      calls.map(async (c) => {
        used.push(c.name);
        const r = await runTool(userId, c.name, c.input);
        return { type: "tool_result" as const, tool_use_id: c.id, content: JSON.stringify(r.result).slice(0, 60_000), is_error: !r.ok };
      }),
    );
    messages.push({ role: "user", content: results });
  }
  return { mode: "live", text: "Analyse interrompue : trop d'appels d'outils. Précise ta question.", toolsUsed: used };
}

/** Mode démonstration : aucune IA, uniquement des règles explicites sur les vraies données. */
async function demo(userId: string, q: string): Promise<CoachReply> {
  const lower = q.toLowerCase();
  const head = "**Mode démonstration — aucun modèle de langage n'est connecté.** Les éléments ci-dessous sont calculés par des règles simples à partir de tes données ; ce n'est pas une analyse de coach.\n\n";
  const used: string[] = [];
  const call = async (name: string, input: unknown = {}) => {
    used.push(name);
    return (await runTool(userId, name, input)).result as Record<string, unknown>;
  };
  const parts: string[] = [];
  if (/fatigu|adapt|aujourd|forme|récup/.test(lower)) {
    const r = (await call("get_readiness")) as { level: string; recommendation: string; signals: { indicator: string; observed: string }[]; dataCoverage: string[] };
    parts.push(`État de forme (moteur de règles) : **${r.level}**. ${r.recommendation}`);
    parts.push(r.signals.length ? "Signaux : " + r.signals.map((s) => `${s.indicator} ${s.observed}`).join(", ") : `Aucun signal défavorable (indicateurs disponibles : ${r.dataCoverage.join(", ") || "aucun — saisis ton ressenti dans Récupération"}).`);
  }
  if (/20|40|niveau|record|puissance|ftp/.test(lower)) {
    const p = (await call("get_power_records")) as { curve: { durationS: number; watts: number; date: string }[]; criticalPowerModel: unknown };
    const at = (s: number) => p.curve.find((c) => c.durationS === s);
    parts.push(`Meilleures puissances (90 j) : 20 min ${at(1200) ? `${Math.round(at(1200)!.watts)} W (${at(1200)!.date})` : "aucune donnée"} ; 40 min ${at(2400) ? `${Math.round(at(2400)!.watts)} W (${at(2400)!.date})` : "aucune donnée"}.`);
    const cpm = p.criticalPowerModel as string | { cp: number; cpUncertainty: number; wPrime_kJ: number; r2: number; predicted20min: number };
    parts.push(typeof cpm === "string" ? cpm : `Modèle CP (estimation, pas une mesure) : CP ≈ ${cpm.cp} ± ${cpm.cpUncertainty} W, W′ ≈ ${cpm.wPrime_kJ} kJ (R² ${cpm.r2}). Puissance prédite sur 20 min : ${cpm.predicted20min} W.`);
  }
  if (/semaine|organis|prépar|plan/.test(lower) || parts.length === 0) {
    const plan = (await call("get_plan")) as { workouts: { date: Date; title: string; durationMin: number; dayRole: string }[] };
    parts.push("Prochaines séances planifiées :\n" + (plan.workouts.slice(0, 8).map((w) => `- ${new Date(w.date).toISOString().slice(0, 10)} · ${w.title} (${w.durationMin} min)`).join("\n") || "aucune — génère le plan depuis le Calendrier."));
  }
  if (/course|analyse/.test(lower)) {
    const a = (await call("get_activities", { races_only: true })) as { activities: { name: string; startTime: Date; normalizedPower: number | null }[] };
    parts.push(a.activities.length ? `Dernière course : ${a.activities[0].name} (${new Date(a.activities[0].startTime).toISOString().slice(0, 10)}), NP ${a.activities[0].normalizedPower ?? "—"} W. L'analyse détaillée de pacing est disponible dans Performance.` : "Aucune course importée.");
  }
  parts.push("\nPour activer le vrai coach : renseigner ANTHROPIC_API_KEY dans .env (et éventuellement COACH_MODEL), puis redémarrer.");
  return { mode: "demo", text: head + parts.join("\n\n"), toolsUsed: used };
}
