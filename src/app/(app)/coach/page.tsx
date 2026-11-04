import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Notice } from "@/components/ui";
import { coachEnabled } from "@/lib/coach/coach";
import { CoachChat } from "./chat";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export default async function Coach() {
  const user = await requireUser();
  const live = coachEnabled();
  const history = await prisma.coachMessage.findMany({ where: { userId: user.id, mode: live ? "live" : "demo" }, orderBy: { createdAt: "asc" }, take: 40 });
  return (
    <>
      <PageHeader title="Coach IA" subtitle={live ? `Modèle : ${process.env.COACH_MODEL || "claude-opus-5-5"}. Le coach lit tes données via des outils internes et ne modifie jamais le plan sans ta validation.` : undefined} />
      {!live && (
        <div className="mb-4"><Notice tone="warn"><b>Mode démonstration.</b> Aucun modèle de langage n'est connecté : les réponses sont produites par des règles simples à partir de tes vraies données (plan, records, état de forme), ce n'est pas un coach. Pour l'activer : ajouter <code>ANTHROPIC_API_KEY</code> dans <code>.env</code> puis redémarrer.</Notice></div>
      )}
      <CoachChat initial={history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content }))} live={live} />
    </>
  );
}
