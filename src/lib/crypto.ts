import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** Chiffrement AES-256-GCM des jetons OAuth / clés API (au repos en base). */
function key(): Buffer {
  const k = process.env.TOKEN_ENCRYPTION_KEY;
  if (!k) throw new Error("TOKEN_ENCRYPTION_KEY manquante (32 octets en base64).");
  const b = Buffer.from(k, "base64");
  if (b.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY doit faire 32 octets (base64).");
  return b;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

export function decrypt(payload: string): string {
  const [v, iv, tag, data] = payload.split(".");
  if (v !== "v1") throw new Error("Format de jeton chiffré inconnu");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}
