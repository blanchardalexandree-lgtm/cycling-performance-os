# Cycling Performance OS

Directeur de performance cycliste personnel : profil avec provenance des données, import et analyse d'activités, plan de saison en cycles **3 jours d'entraînement + 1 jour de récupération active**, moteur de séances avec exports, coach IA qui **propose** (jamais de modification silencieuse), intégrations par canaux officiels uniquement.

Stack : Next.js 16 (App Router, actions serveur), React 19, TypeScript strict, Tailwind v4, Prisma 6 + PostgreSQL, Recharts, `@garmin/fitsdk` (SDK FIT officiel), `@anthropic-ai/sdk`.

## Démarrage

```bash
cp .env.example .env            # puis remplir DATABASE_URL et TOKEN_ENCRYPTION_KEY (openssl rand -base64 32)
npm install
npx prisma migrate deploy       # crée le schéma
SEED_EMAIL=moi@exemple.fr SEED_PASSWORD='…' npm run db:seed   # compte + profil + calendrier RVC 2027 (optionnel)
npm run build && npm start      # http://localhost:3000
```

Développement : `npm run dev`. Vérifications : `npm run lint` (tsc) et `npm test` (vitest).

Déploiement : n'importe quel hébergeur Node 20+ avec PostgreSQL (Railway, Render, Fly.io, VPS…). Mettre `APP_URL` sur l'URL publique en HTTPS, `ALLOW_REGISTRATION="false"` une fois ton compte créé.

## Intégrations — état réel

| Service | Canal | État |
|---|---|---|
| Fichiers FIT / GPX / TCX | Import direct (glisser-déposer, multi-fichiers) | **Fonctionne, testé** |
| Strava | OAuth officiel + API v3 + webhook | **Implémenté, non testé contre Strava** (nécessite tes identifiants) |
| Garmin | Personal API (clé personnelle) | Clé enregistrée chiffrée et testée ; synchro des activités **à compléter** (endpoints non documentés publiquement) → utiliser l'export FIT |
| Nolio | API officielle | **Bloqué** : « API access requires any active paid subscription ». Export FIT depuis Nolio en attendant |

### Strava
1. Il faut un abonnement Strava pour créer une application (règle Strava 2026). Les nouvelles applis sont en mode « un seul athlète », ce qui suffit ici.
2. https://www.strava.com/settings/api → créer l'app, *Authorization Callback Domain* = domaine de `APP_URL` (ex. `localhost`).
3. Copier Client ID / Secret dans `.env`, redémarrer, puis Intégrations → Connecter Strava.
4. Webhook (synchro automatique, nécessite une URL publique) :
   ```bash
   curl -X POST https://www.strava.com/api/v3/push_subscriptions \
     -F client_id=$STRAVA_CLIENT_ID -F client_secret=$STRAVA_CLIENT_SECRET \
     -F callback_url=$APP_URL/api/integrations/strava/webhook -F verify_token=$STRAVA_WEBHOOK_VERIFY_TOKEN
   ```
   Mettre l'`id` renvoyé dans `STRAVA_SUBSCRIPTION_ID`.

Points de politique pris en compte : permissions minimales (`read`, `activity:read_all`), respect des quotas (en-têtes `X-RateLimit-*`, 40 appels de flux max par synchro), puissance ignorée si elle n'est pas mesurée par un capteur (`device_watts=false`), **activités issues uniquement de Strava exclues du coach IA** (conditions de l'API), révocation gérée. À vérifier de ton côté : durée maximale de conservation en cache exigée par Strava.

### Garmin
Créer une clé sur https://connect.garmin.com/app/settings/personalApiToken et la coller dans Intégrations. L'application vérifie qu'elle donne un jeton. La lecture des activités sera branchée dès que la documentation des endpoints sera accessible ; d'ici là : Garmin Connect → activité → *Exporter le fichier original* (.fit).

## Coach IA
- Avec `ANTHROPIC_API_KEY` : modèle `COACH_MODEL` (défaut `claude-opus-5-5`) avec des outils de lecture (profil, activités, records + modèle CP, charge, forme, objectifs, plan) et un seul outil d'écriture, `propose_plan_change`, qui crée une **proposition en attente** à valider dans le Dashboard ou le Calendrier.
- Sans clé : **mode démonstration** affiché partout, réponses par règles à partir de tes données.
- Tous les calculs physiologiques sont déterministes et faits par l'application, jamais par le modèle.
- Mode d'adaptation automatique : **désactivé** (pas encore implémenté). Il ne sera activé qu'avec des règles que tu choisis.

## Calculs et limites
- **NP** : moyenne mobile 30 s, puissance 4, racine 4e. **IF** = NP / référence. **TSS** = durée × NP × IF / (référence × 3600) × 100.
- **Référence de puissance** : FTP mesurée ou déclarée > CP estimée > FTP estimée. Jamais d'hypothèse. Si la référence est postérieure à l'activité, c'est indiqué.
- **PMC** : CTL = moyenne exponentielle 42 j, ATL = 7 j, TSB = CTL − ATL de la veille.
- **CP / W′** : modèle 2 paramètres (travail = CP·t + W′) par régression sur 2–20 min, avec erreurs-types et R². Refusé comme estimation si R² < 0,95. Surestime au-delà de ~30 min.
- **hrTSS** : approximation à partir de la FC moyenne et du LTHR, signalée comme telle.
- **Découplage Pw:HR** : pertinent uniquement sur effort stable.
- **CdA** : élévation virtuelle (méthode de Chung), intervalle selon Crr ± 0,001 et ρ ± 2 %. **Expérimental**, protocole strict requis.
- **Forme du jour** : feu orange seulement si ≥ 2 signaux concordants, rouge en cas de douleur, arrêt en cas de maladie.
- **Déduplication** : même source + identifiant → doublon ; sinon même départ (± 180 s) et durée proche (± 10 % ou 5 min) → fusion (une seule activité, sources multiples, meilleur flux conservé).

## Planification
- Cycle 3 + 1 calé sur une date « jour 1 » réglable. Aucun jour off par défaut ; les contraintes (cours, examens, stage, indisponibilités) plafonnent ou suppriment l'entraînement.
- Phases calculées à partir des objectifs A/B/C ; tous les 4 cycles, un cycle d'assimilation. Veille de course : déblocage ; lendemain : récupération. Pas deux jours intenses d'affilée. Test proposé si aucune référence mesurée depuis 56 jours.
- La régénération ne touche jamais : séances verrouillées, passées, réalisées, ou créées par toi ou le coach. Une séance manquée n'est **pas** rattrapée par une surcharge.
- Exports : **.zwo** (Zwift), **.mrc** (ERG générique), **.fit** (séance structurée Garmin/Wahoo, encodée avec le SDK officiel).

## Tests réalisés
- 40 tests unitaires : formules (NP, TSS, CP, PMC, découplage, CdA, rythme), plan 3+1 (règles, courses, contraintes), import FIT/GPX/TCX, exports et ré-décodage du FIT.
- Parcours navigateur de bout en bout (Playwright, ordinateur + iPhone 13) : inscription, profil, import RVC, import de 19 FIT + 1 TCX dupliqué (fusion correcte), génération 12 semaines, toutes les pages, coach en mode démo ; aucune erreur console, aucun débordement horizontal sur mobile.
- Non testé : appels réels Strava / Garmin / Anthropic (pas d'identifiants dans l'environnement de construction).

## Prochaines étapes
Synchro Garmin (endpoints), mode d'adaptation automatique à règles choisies, export iCal du plan, comparaison de courses enrichie, tests d'intégration Strava avec un compte réel.
