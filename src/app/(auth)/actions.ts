"use server";
import { z } from "zod";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createSession, hashPassword, verifyPassword } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { bootstrapUser } from "@/lib/bootstrap";

export type AuthState = { error?: string } | undefined;

async function ip() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

const Login = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

export async function login(_: AuthState, form: FormData): Promise<AuthState> {
  if (!rateLimit(`login:${await ip()}`, 10, 15 * 60_000)) return { error: "Trop de tentatives. Réessaie dans 15 minutes." };
  const p = Login.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: "Email ou mot de passe invalide." };
  const user = await prisma.user.findUnique({ where: { email: p.data.email.toLowerCase() } });
  if (!user || !(await verifyPassword(p.data.password, user.passwordHash))) return { error: "Email ou mot de passe incorrect." };
  await createSession(user.id);
  redirect("/");
}

const Register = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().email().max(200),
  password: z.string().min(10, "10 caractères minimum").max(200),
});

export async function register(_: AuthState, form: FormData): Promise<AuthState> {
  if (!rateLimit(`register:${await ip()}`, 5, 60 * 60_000)) return { error: "Trop de tentatives." };
  if (process.env.ALLOW_REGISTRATION === "false" && (await prisma.user.count()) > 0) return { error: "Les inscriptions sont fermées sur cette instance." };
  const p = Register.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Données invalides." };
  const email = p.data.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) return { error: "Un compte existe déjà avec cet email." };
  const user = await prisma.user.create({ data: { email, name: p.data.name, passwordHash: await hashPassword(p.data.password) } });
  await bootstrapUser(user.id);
  await createSession(user.id);
  redirect("/");
}
