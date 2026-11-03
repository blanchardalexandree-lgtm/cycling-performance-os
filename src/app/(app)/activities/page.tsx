import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, Empty, PageHeader } from "@/components/ui";
import { Upload } from "./upload";
import { fmtDate, fmtDuration, fmtNum } from "@/lib/format";

export const dynamic = "force-dynamic";

const SRC: Record<string, string> = { FILE_FIT: "FIT", FILE_GPX: "GPX", FILE_TCX: "TCX", STRAVA: "Strava", GARMIN: "Garmin", NOLIO: "Nolio", MANUAL: "Manuel" };

export default async function Activities({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser();
  const page = Math.max(1, Number((await searchParams).page ?? 1) || 1);
  const [acts, total] = await Promise.all([
    prisma.activity.findMany({ where: { userId: user.id }, orderBy: { startTime: "desc" }, skip: (page - 1) * 50, take: 50, include: { sources: { select: { source: true } } } }),
    prisma.activity.count({ where: { userId: user.id } }),
  ]);
  return (
    <>
      <PageHeader title="Activités" subtitle={`${total} activité(s) centralisée(s). Chaque effort ne compte qu'une fois, quelle que soit sa source.`} />
      <Card title="Importer" className="mb-4"><Upload /></Card>
      <Card title="Historique">
        {acts.length === 0 ? <Empty>Aucune activité. Importe des fichiers ou connecte Strava.</Empty> : (
          <div className="overflow-x-auto">
            <table className="table min-w-[760px]">
              <thead><tr><th>Date</th><th>Activité</th><th>Durée</th><th>Distance</th><th>D+</th><th>P moy.</th><th>NP</th><th>FC</th><th>TSS</th><th>Sources</th></tr></thead>
              <tbody>
                {acts.map((a) => (
                  <tr key={a.id} className="hover:bg-surface-2">
                    <td className="whitespace-nowrap text-ink-3">{fmtDate(a.startTime, { day: "numeric", month: "short", year: "2-digit" })}</td>
                    <td className="max-w-[260px] truncate"><Link href={`/activities/${a.id}`} className="hover:text-accent">{a.name}</Link>{a.isRace && <span className="chip ml-2 border-accent/40 text-accent">course</span>}{a.isIndoor && <span className="chip ml-1">HT</span>}</td>
                    <td className="num">{fmtDuration(a.durationS)}</td>
                    <td className="num">{a.distanceM ? fmtNum(a.distanceM / 1000, 1, "km") : "—"}</td>
                    <td className="num">{fmtNum(a.elevationGainM, 0, "m")}</td>
                    <td className="num">{fmtNum(a.avgPower, 0, "W")}</td>
                    <td className="num">{fmtNum(a.normalizedPower, 0, "W")}</td>
                    <td className="num">{fmtNum(a.avgHr)}</td>
                    <td className="num" title={a.tssMethod ?? "non calculable"}>{fmtNum(a.tss)}</td>
                    <td className="text-xs text-ink-3">{[...new Set(a.sources.map((s) => SRC[s.source]))].join(" + ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 flex gap-2">
          {page > 1 && <Link className="btn-ghost" href={`/activities?page=${page - 1}`}>Précédent</Link>}
          {page * 50 < total && <Link className="btn-ghost" href={`/activities?page=${page + 1}`}>Suivant</Link>}
        </div>
      </Card>
    </>
  );
}
