# WattsUp Energy — consignes pour Claude

Application web open source (GPL-3.0) qui reçoit les données énergie poussées par Home
Assistant et calcule budget, contrats, chauffage et rentabilité. Interface et échanges
**en français** ; code et identifiants en anglais.

## Sources de vérité (à relire avant toute tâche)

- `docs/SPEC.md` : spécification validée (modèle de données, contrat d'API, règles métier,
  écrans, limites). Elle prime sur la maquette et sur le PRD.
- `docs/TASKS.md` : liste des tâches T1…T34 avec critères d'acceptation, fichiers et
  vérifications ; cocher `[x]` la tâche terminée dans le même commit.
- `docs/PLAN.md` : jalons, checkpoints (s'arrêter pour une revue humaine), risques.
- `docs/PRD HA energy analyze.md` et `docs/wattsup-energy-app-design/` : PRD d'origine et
  maquette, **référence de principe** seulement.
- Si une décision change, mettre à jour la spec (et TASKS/PLAN) dans le même commit.

## Méthode

- Phase 4 du skill « spec avant code » : une tâche à la fois, dans l'ordre de TASKS.md,
  commit atomique `feat|fix|chore|docs(scope): …` qui cite `Txx`, puis push.
- TDD pour tout `src/domain/**` (≥ 90 % de lignes) ; test d'isolation multi-tenant
  (`describeTenantIsolation`, `tests/helpers/tenancy.ts`) pour chaque opération serveur.
- Vérifier dans le navigateur intégré (serveur `wattsup-dev`, `.claude/launch.json`) tout
  changement visible, compte de démo local : identifiants dans `.env.example`.
- « Demander d'abord » : changement de schéma DB hors tâche, nouvelle dépendance runtime,
  rupture du contrat d'ingestion v1, changement Docker/Coolify. Pas de code mort.

## Commandes

pnpm n'est pas installé globalement : `corepack pnpm@9.15.9 <cmd>` (ou un shim).

```
docker compose up -d db        # Postgres 16 local (bases wattsup et wattsup_test)
pnpm dev                       # :3000
pnpm lint                      # eslint + tsc --noEmit (supprimer tsconfig.tsbuildinfo si tsc semble ignorer tsconfig)
pnpm test                      # unit + integration (integration = vraie base wattsup_test)
pnpm test:unit | test:integration | test:coverage
pnpm db:generate --name <nom>  # migration Drizzle (une suppression et une création de table = deux migrations, sinon drizzle-kit pose une question interactive)
pnpm db:migrate | db:seed | tempo:sync | weather:sync
pnpm build                     # écrase le cache du serveur de dev : relancer wattsup-dev ensuite
```

## Architecture (rappels)

- Next.js 15 App Router, Drizzle + postgres-js, Better Auth, Zod 4, Tailwind 4.
- `src/domain` pur (aucun I/O) ; `src/server` = accès DB, opérations `operation(ctx, input)`
  filtrées par `ctx.householdId` via `getHouseholdContext()` ; Server Actions minces dans
  `src/server/actions`.
- Montants en centimes, arrondis une seule fois ; seaux horaires en heures UTC, fuseau du
  foyer pour les jours, mois et plages tarifaires (`src/lib/time.ts`).
- Données publiques globales (`tempo_calendar`, `weather_daily` par maille de 0,01°) ;
  surcharges par foyer (`tempo_override`). Appels sortants : api-couleur-tempo.fr et
  Open-Meteo uniquement (`src/server/http.ts`), désactivables par `TEMPO_SYNC=off`,
  `WEATHER_SYNC=off`. Planificateur intégré au serveur (`src/server/scheduler.ts`).
- Migrations appliquées au démarrage en production (`src/instrumentation.ts`).

## Pièges déjà rencontrés

- Une valeur (non composant) importée d'un module `"use client"` est illisible côté
  serveur : la mettre dans un module partagé.
- Styles globaux dans `@layer base`, sinon ils l'emportent sur les utilitaires Tailwind.
- Variables de police sur `<html>` (lues par `--font-sans` sur `:root`) ; polices
  auto-hébergées dans `src/fonts` (pas de `next/font/google`, le build Coolify échoue).
- Scripts `tsx` : envelopper dans `async function main()` (pas d'`await` au premier niveau,
  package en CommonJS) et passer `--tsconfig tsconfig.json` pour l'alias `@/`.
- Docker OrbStack peut se figer : `docker ps` sans réponse → demander un redémarrage.

## Déploiement et Home Assistant

- Coolify : application `wattsup-energy` (uuid `58megnmhiq5upoqwd68jiji7`), branche `main`,
  Dockerfile, https://wattsup-energy.kraftpunk.app ; base `wattsup` sur `postgres-partage`.
  Un push sur `main` redéploie (webhook) ; suivre avec le MCP Coolify (`list_deployments`),
  vérifier `/api/health`. Le MCP ne peut pas créer de ressources : l'utilisateur le fait.
- HA de l'utilisateur : automatisation `automation.wattsup_energy_envoi_des_donnees`
  (blueprint `bonnoa/wattsup_push.yaml`, mode horaire, capteurs du routeur solaire, de
  l'Envoy et du Marstek). Avant toute modification : lire le guide du MCP Home Assistant,
  obtenir l'accord explicite, garder la config précédente pour revenir en arrière.
