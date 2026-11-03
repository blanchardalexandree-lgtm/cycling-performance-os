import "server-only";
import { createHash, randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const COOKIE = "cpos_session";
const SESSION_DAYS = 30;
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const h = await scrypt(pw, salt, 64, SCRYPT);
  return `scrypt$${salt.toString("base64")}$${h.toString("base64")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, salt, hash] = stored.split("$");
  if (alg !== "scrypt") return false;
  const h = await scrypt(pw, Buffer.from(salt, "base64"), 64, SCRYPT);
  const expected = Buffer.from(hash, "base64");
  return expected.length === h.length && timingSafeEqual(expected, h);
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  const ua = (await headers()).get("user-agent")?.slice(0, 200);
  await prisma.session.create({ data: { tokenHash: sha(token), userId, expiresAt, userAgent: ua } });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const c = await cookies();
  const t = c.get(COOKIE)?.value;
  if (t) await prisma.session.deleteMany({ where: { tokenHash: sha(t) } });
  c.delete(COOKIE);
}

export async function getSessionUser() {
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return null;
  const s = await prisma.session.findUnique({ where: { tokenHash: sha(t) }, include: { user: true } });
  if (!s || s.expiresAt < new Date()) return null;
  return s.user;
}

/** À appeler dans chaque page / action protégée. */
export async function requireUser() {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  return u;
}
