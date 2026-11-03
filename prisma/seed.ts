/**
 * Création du compte initial (aucune donnée sportive inventée).
 * Usage : SEED_EMAIL=... SEED_PASSWORD=... SEED_NAME=Alexandre npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";
import { RVC_2027 } from "../src/lib/seed-data/rvc-2027";
import { bootstrapUser, importRvcCalendar } from "../src/lib/bootstrap";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_EMAIL?.toLowerCase();
  const password = process.env.SEED_PASSWORD;
  if (!email || !password || password.length < 10) throw new Error("SEED_EMAIL et SEED_PASSWORD (≥ 10 caractères) requis.");
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: process.env.SEED_NAME ?? "Alexandre", passwordHash: `scrypt$${salt.toString("base64")}$${hash.toString("base64")}` },
  });
  await bootstrapUser(user.id);
  const n = await importRvcCalendar(user.id);
  console.log(`Compte ${email} prêt. ${n} épreuve(s) du calendrier RVC 2027 importée(s) sur ${RVC_2027.length}.`);
}

main().finally(() => prisma.$disconnect());
