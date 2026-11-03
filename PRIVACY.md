# Confidentialité et sécurité

Cycling Performance OS est conçu pour être auto-hébergé : tes données restent dans ta base PostgreSQL.

## Données stockées
- Compte : e-mail, nom, mot de passe haché (scrypt, sel aléatoire). Aucune copie en clair.
- Sessions : seul un hachage SHA-256 du jeton est stocké ; cookie `httpOnly`, `SameSite=Lax`, `Secure` en production.
- Profil, métriques (avec leur provenance : mesurée, estimée, déclarée, hypothèse), activités et leurs flux, plan, objectifs, contraintes, état de forme, conversations avec le coach.
- Intégrations : tokens OAuth Strava et clé Garmin **chiffrés** (AES-256-GCM, clé `TOKEN_ENCRYPTION_KEY` côté serveur uniquement). Jamais envoyés au navigateur.

## Isolation
Chaque requête filtre sur l'identifiant de l'utilisateur connecté. Les routes API vérifient l'origine (protection CSRF) ; les actions serveur sont protégées par Next.js. Limitation de débit sur la connexion, l'import et le coach.

## Données transmises à des tiers
- **Strava / Garmin** : uniquement les appels nécessaires (lecture des activités) avec les permissions minimales (`read`, `activity:read_all` pour Strava).
- **Modèle de langage (Anthropic)** : seulement si `ANTHROPIC_API_KEY` est renseignée. Le coach reçoit les résumés que ses outils lisent (profil, charge, records, plan). **Les activités venant uniquement de Strava sont exclues** (conditions de l'API Strava). Aucune donnée n'est envoyée en mode démonstration.

## Suppression
- Déconnexion d'une intégration : révocation côté service quand c'est possible, suppression des tokens.
- Suppression du compte (page Profil, saisir « SUPPRIMER ») : efface en cascade toutes les données de l'utilisateur.
- Strava : si tu révoques l'accès depuis Strava, le webhook marque le compte révoqué.
