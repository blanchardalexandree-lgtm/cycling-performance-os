/**
 * Garmin Connect — état réel des accès (vérifié novembre 2026)
 *
 *  - Garmin Connect Developer Program « Business » (Health, Activity, Training API) : réservé aux
 *    entreprises, sur dossier ; pas pertinent pour un usage personnel.
 *  - « Personal API » (réouverte en octobre 2026) : accès à SES PROPRES données. On génère une clé
 *    dans Garmin Connect Web → Paramètres → Personal API Key (https://connect.garmin.com/app/settings/personalApiToken),
 *    puis on l'échange contre un jeton d'accès (24 h, pas de refresh token) :
 *      POST https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token
 *      Authorization: ApiKey <clé>
 *    Données annoncées : activités (JSON + .FIT), santé (JSON). Mode « pull » uniquement.
 *    Training API (envoi de séances vers la montre) : NON inclus dans l'accès personnel.
 *  - Les chemins des endpoints d'activités sont décrits dans la documentation Swagger de Garmin
 *    (https://developer.garmin.com/gc-developer-program/personal/swagger-docs/), non consultable
 *    depuis l'environnement de développement. Seul l'échange de jeton est donc implémenté ;
 *    la lecture des activités sera branchée une fois les chemins vérifiés.
 *  - Aucune connexion par identifiant/mot de passe ni scraping : interdit et fragile.
 *  - Alternative fonctionnelle dès maintenant : import des fichiers .FIT (export Garmin Connect
 *    ou copie depuis le compteur) via la page Activités.
 */
import { prisma } from "../db";
import { decrypt, encrypt } from "../crypto";

const TOKEN_URL = "https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token";

export async function saveGarminKey(userId: string, apiKey: string) {
  await prisma.integrationAccount.upsert({
    where: { userId_provider: { userId, provider: "garmin" } },
    create: { userId, provider: "garmin", refreshTokenEnc: encrypt(apiKey), status: "pending", scopes: [] },
    update: { refreshTokenEnc: encrypt(apiKey), status: "pending", accessTokenEnc: null, lastError: null },
  });
}

/** Teste réellement la clé en demandant un jeton d'accès. */
export async function testGarminKey(userId: string): Promise<{ ok: boolean; message: string }> {
  const acc = await prisma.integrationAccount.findUnique({ where: { userId_provider: { userId, provider: "garmin" } } });
  if (!acc?.refreshTokenEnc) return { ok: false, message: "Aucune clé Personal API enregistrée." };
  try {
    const res = await fetch(TOKEN_URL, { method: "POST", headers: { Authorization: `ApiKey ${decrypt(acc.refreshTokenEnc)}` } });
    if (!res.ok) {
      const msg = res.status === 401 || res.status === 403 ? "Clé refusée par Garmin (invalide ou expirée)." : `Garmin a répondu ${res.status}.`;
      await prisma.integrationAccount.update({ where: { id: acc.id }, data: { status: "error", lastError: msg } });
      return { ok: false, message: msg };
    }
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const token = (body.accessToken ?? body.access_token ?? body.token) as string | undefined;
    await prisma.integrationAccount.update({
      where: { id: acc.id },
      data: { status: token ? "connected" : "error", accessTokenEnc: token ? encrypt(token) : null, expiresAt: new Date(Date.now() + 24 * 3600_000), lastError: token ? null : "Réponse de jeton inattendue." },
    });
    return token ? { ok: true, message: "Clé valide : jeton d'accès obtenu (24 h)." } : { ok: false, message: "Réponse de jeton inattendue : format à vérifier dans la documentation Swagger." };
  } catch (e) {
    const msg = `Garmin injoignable : ${e instanceof Error ? e.message : "erreur réseau"}`;
    await prisma.integrationAccount.update({ where: { id: acc.id }, data: { status: "error", lastError: msg } });
    return { ok: false, message: msg };
  }
}
