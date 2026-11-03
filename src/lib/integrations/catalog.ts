/** Description honnête de chaque intégration, affichée sur la page Intégrations. */
export interface IntegrationInfo {
  id: "strava" | "garmin" | "nolio" | "files";
  name: string;
  status: "available" | "needs-config" | "blocked" | "partial";
  summary: string;
  canRead: string[];
  cannot: string[];
  todo: string[];
  docs: { label: string; url: string }[];
}

export function integrationCatalog(env: { stravaConfigured: boolean }): IntegrationInfo[] {
  return [
    {
      id: "files", name: "Import de fichiers (.fit, .gpx, .tcx)", status: "available",
      summary: "Fonctionnel. Décodage FIT avec le SDK officiel Garmin ; détection des doublons avec les autres sources.",
      canRead: ["Puissance, FC, cadence, vitesse, altitude, GPS à 1 Hz", "Résumé de session (durée, distance, dénivelé)", "Identifiant du capteur de puissance (si présent)"],
      cannot: ["Les GPX ne contiennent souvent ni puissance ni FC selon l'appareil"],
      todo: [],
      docs: [{ label: "Garmin FIT SDK", url: "https://developer.garmin.com/fit" }],
    },
    {
      id: "strava", name: "Strava", status: env.stravaConfigured ? "available" : "needs-config",
      summary: "OAuth 2.0 officiel, synchronisation incrémentale, webhook, respect des quotas.",
      canRead: ["Activités (y compris privées avec activity:read_all)", "Flux : puissance capteur, FC, cadence, vitesse, altitude, GPS"],
      cannot: [
        "Puissance estimée par Strava : ignorée (seule la puissance capteur est utilisée)",
        "Données Strava exclues du coach IA : la politique API Strava interdit leur usage dans des applications d'IA",
        "Quotas par application (lecture : 100 req/15 min et 1 000/jour par défaut) : l'historique complet s'importe en plusieurs fois",
      ],
      todo: env.stravaConfigured ? [] : [
        "Disposer d'un abonnement Strava (obligatoire pour créer une application API)",
        "Créer l'application sur https://www.strava.com/settings/api (Authorization Callback Domain = domaine de l'app)",
        "Renseigner STRAVA_CLIENT_ID et STRAVA_CLIENT_SECRET dans .env puis redémarrer",
        "Optionnel : STRAVA_WEBHOOK_VERIFY_TOKEN puis créer l'abonnement webhook (voir README)",
      ],
      docs: [
        { label: "Getting started", url: "https://developers.strava.com/docs/getting-started/" },
        { label: "Rate limits", url: "https://developers.strava.com/docs/rate-limits/" },
        { label: "API Agreement", url: "https://www.strava.com/legal/api" },
      ],
    },
    {
      id: "garmin", name: "Garmin Connect", status: "partial",
      summary: "Personal API (accès à vos propres données) : enregistrement et test réel de la clé implémentés. Lecture des activités en attente de vérification des endpoints Swagger.",
      canRead: ["Annoncé par Garmin : activités JSON + fichiers .FIT, données santé JSON"],
      cannot: [
        "Envoi de séances vers la montre / le compteur (Training API) : non inclus dans l'accès personnel",
        "HRV, sommeil : non confirmés dans l'accès personnel à ce jour",
        "Pas de connexion par mot de passe ni de scraping",
      ],
      todo: [
        "Générer une clé dans Garmin Connect Web → Paramètres → Personal API Key",
        "La coller sur cette page puis cliquer « Tester »",
        "En attendant : exporter les .FIT depuis Garmin Connect et les importer (Activités)",
        "Pour mettre une séance sur le compteur : export .FIT (Séances) à copier dans GARMIN/NewFiles",
      ],
      docs: [
        { label: "Personal API", url: "https://developer.garmin.com/gc-developer-program/personal/personal-api/" },
        { label: "FAQ", url: "https://developer.garmin.com/gc-developer-program/personal/personal-faq/" },
      ],
    },
    {
      id: "nolio", name: "Nolio", status: "blocked",
      summary: "API testée le 3 novembre 2026 : refus « API access requires any active paid subscription ». Aucune connexion simulée.",
      canRead: ["Avec un abonnement payant actif : calendrier prévu/réalisé, séances, records, charge (lecture et écriture de séances planifiées)"],
      cannot: ["Sans abonnement payant : aucun accès API"],
      todo: [
        "Option 1 : souscrire un abonnement Nolio payant, puis demander l'activation du connecteur",
        "Option 2 : télécharger les fichiers originaux (.fit) des séances depuis Nolio et les importer",
      ],
      docs: [{ label: "Nolio", url: "https://www.nolio.io" }],
    },
  ];
}
