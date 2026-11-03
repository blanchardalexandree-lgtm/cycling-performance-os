import { prisma } from "./db";
import { RVC_2027 } from "./seed-data/rvc-2027";

/** Profil initial prérempli (toutes les valeurs restent modifiables). Aucune valeur physiologique inventée. */
export async function bootstrapUser(userId: string) {
  await prisma.athleteProfile.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      discipline: "Cyclisme sur route",
      level: "Haut niveau amateur — division nationale",
      specialties: ["Contre-la-montre individuel", "Efforts soutenus", "Courses sur route", "Performance globale"],
      heightCm: 175,
      generalGoal: "Réaliser une très grosse saison, progresser physiquement et performer sur les objectifs prioritaires.",
      constraints: "Études de kinésithérapie : cours, stages, examens. Déplacements et compétitions.",
      environment: ["Extérieur", "Home trainer"],
      equipment: ["Capteur de puissance", "Cardiofréquencemètre", "Compteur GPS"],
    },
  });
  await prisma.userSettings.upsert({ where: { userId }, update: {}, create: { userId } });
  const week = [90, 90, 90, 90, 90, 240, 240];
  for (let d = 0; d < 7; d++) {
    await prisma.weeklyAvailability.upsert({ where: { userId_weekday: { userId, weekday: d } }, update: {}, create: { userId, weekday: d, maxMinutes: week[d], outdoorOk: true } });
  }
}

/** Importe le calendrier RVC 2027 (idempotent : ignore les épreuves déjà présentes à la même date). */
export async function importRvcCalendar(userId: string) {
  let added = 0;
  for (const e of RVC_2027) {
    const date = new Date(e.date + "T00:00:00Z");
    const exists = await prisma.goal.findFirst({ where: { userId, name: e.name, date } });
    if (exists) continue;
    await prisma.goal.create({
      data: {
        userId, name: e.name, date, endDate: e.endDate ? new Date(e.endDate + "T00:00:00Z") : null, kind: e.kind, priority: e.priority,
        confirmed: e.confirmed ?? true, demands: e.demands ?? [], discipline: "Route",
      },
    });
    added++;
  }
  return added;
}
