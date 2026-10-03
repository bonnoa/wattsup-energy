# Tâches : WattsUp Energy V1

> Statut : **brouillon à valider** (phase 3 « Tasks »)
> Sources : [SPEC.md](./SPEC.md) · [PLAN.md](./PLAN.md)
> Dernière mise à jour : 2026-10-03

## Définition de « terminé » (s'applique à chaque tâche)

- [ ] Critères d'acceptation de la tâche cochés
- [ ] `pnpm lint && pnpm test && pnpm build` au vert
- [ ] Tests écrits **avant** le code pour tout ce qui vit dans `src/domain`
- [ ] Toute action serveur nouvelle est couverte par le harnais d'isolation (T3)
- [ ] Pas de secret ni de token en clair, ni dans le code ni dans les logs
- [ ] Textes UI en français et nombres au format fr-FR
- [ ] Commit atomique `feat|fix|chore(scope): …` référençant `Txx`
- [ ] Si la tâche touche une règle de la spec, la spec est mise à jour dans le même commit

Légende des tailles : **S** = 1–2 fichiers · **M** = 3–5 fichiers (hors tests et migrations générées).

---

## Jalon 0 : Socle

- [x] **T1 — Initialiser le repo** · M · Dépend de : —
  - Acceptation :
    - `git init` ; `.gitignore` (node_modules, .env*, .next) ; `LICENSE` GPL-3.0-or-later ; `.env.example`
    - Next.js 15 (App Router, `src/`), TS `strict`, pnpm 9, ESLint (`next/core-web-vitals` + `@typescript-eslint/strict`), Prettier (largeur 100)
    - Tailwind 4 avec les tokens de couleur de la spec §2, polices Instrument Sans et JetBrains Mono via `next/font`
    - Vitest configuré (`tests/unit`, alias `@/`), avec un test témoin
    - Scripts `package.json` de la spec §3 (ceux qui dépendent de la DB : stubs)
  - Vérifier : `pnpm lint && pnpm test && pnpm build`
  - Fichiers : `package.json`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`, `src/app/globals.css`, `src/app/layout.tsx`, `LICENSE`

- [x] **T2 — Base de données et authentification** · M · Dépend de : T1
  - Acceptation :
    - `docker-compose.yml` avec un service `db` (Postgres 16, volume nommé)
    - Drizzle + `drizzle-kit` ; première migration avec les tables Better Auth + `household` (`timezone`, `granularity`, `profile`, `settings` JSONB avec les valeurs par défaut de la spec §5)
    - Better Auth en email + mot de passe ; pages `/connexion` et `/inscription` ; un foyer est créé à l'inscription (hook `user.create.after`, rattrapé par `ensureHousehold()` idempotent si le hook échoue)
    - Middleware : toute route `(app)` sans session redirige vers `/connexion`
  - Vérifier : `docker compose up -d db && pnpm db:migrate && pnpm test tests/integration/auth` ; manuel : inscription, déconnexion, connexion
  - Fichiers : `docker-compose.yml`, `src/db/schema.ts`, `src/db/index.ts`, `src/server/auth.ts`, `src/app/(auth)/…`, `src/middleware.ts`

- [x] **T3 — Contexte foyer et harnais d'isolation** · S · Dépend de : T2
  - Acceptation :
    - `getHouseholdContext()` renvoie `{ userId, householdId, timezone, profile, settings }` ou lève une erreur 401
    - `tests/helpers/tenancy.ts` : crée 2 foyers et vérifie qu'une action exécutée en tant que A ne lit ni ne modifie rien chez B ; réutilisable via `describeTenantIsolation(action, setup)`
    - `globalSetup` Vitest : base de test vidée et migrée à chaque lancement ; chaque test crée ses propres foyers (emails uniques)
    - Convention : chaque opération serveur s'écrit `operation(ctx, input)` ; la Server Action n'est qu'une enveloppe autour de `getHouseholdContext()`
  - Vérifier : `pnpm test tests/integration/tenancy`
  - Fichiers : `src/server/context.ts`, `tests/helpers/tenancy.ts`, `tests/setup/global.ts`

- [x] **T4 — Shell UI et visibilité des modules** · M · Dépend de : T3
  - Acceptation :
    - `visibleModules(profile)` est pure et couvre les 6 règles de la spec §7.6 (tests table-driven)
    - Layout `(app)` : sidebar sombre de 232 px à partir de 1024 px ; header + onglets en bas en dessous (cibles ≥ 44 px) ; la nav provient de `visibleModules`
    - 5 pages vides (`/`, `/chauffage`, `/rentabilite`, `/contrats`, `/reglages`) ; une page masquée redirige vers `/`
    - Réglages › Profil énergétique : 5 interrupteurs persistés via Server Action + Zod
  - Vérifier : `pnpm test tests/unit/domain/profile` ; manuel à 1280 et 390 px : couper solaire et batterie fait disparaître Rentabilité de la nav
  - Fichiers : `src/domain/profile.ts`, `src/app/(app)/layout.tsx`, `src/components/nav/*`, `src/app/(app)/reglages/profile-form.tsx`, `src/server/actions/profile.ts`

### ✅ Checkpoint A : connexion, nav adaptative, isolation testée. Revue de l'UI shell avec Alexandre.

---

## Jalon 1 : Ingestion de bout en bout

- [x] **T5 — Tokens d'ingestion** · S · Dépend de : T3
  - Acceptation :
    - Format `wu_` + 32 octets base62 ; stockage du hash sha-256 et d'un préfixe de 8 caractères
    - Réglages › Ingestion : génération (token en clair affiché **une seule fois**), copier, régénérer (révoque l'ancien), révoquer
    - `verifyIngestToken(header)` cherche par hash (index unique, aucune comparaison du secret) et met à jour `last_used_at` ; un seul token actif par foyer (index unique partiel)
  - Vérifier : `pnpm test tests/integration/ingest-token` (+ isolation)
  - Fichiers : `src/db/schema.ts`, `src/server/ingest/token.ts`, `src/app/(app)/reglages/ingest-card.tsx`

- [x] **T6 — Normalisation horaire des index (domaine)** · S · Dépend de : T1
  - Acceptation :
    - `indexToIntervals(prev, current, tz)` renvoie des intervalles horaires + des avertissements
    - Tests : delta simple ; reset (valeur < précédente) ; trou < 24 h réparti au prorata ; trou > 24 h absorbé avec avertissement ; premier index (aucun delta) ; passage à l'heure d'hiver (heure dupliquée) et à l'heure d'été (heure manquante)
    - Plafond de plausibilité par métrique (ex. > 30 kWh/h sur `grid_import`) → avertissement, valeur conservée
  - Vérifier : `pnpm test tests/unit/domain/ingest/hourly`
  - Fichiers : `src/domain/ingest/hourly.ts`, `src/lib/time.ts`

- [x] **T7 — Schémas Zod v1 et normalisation quotidienne** · S · Dépend de : T1
  - Acceptation :
    - `ingestPayloadV1` est une union discriminée horaire/quotidien conforme à la spec §6.1–6.2 ; tous les blocs sont optionnels sauf `version` et `ts`/`date`
    - `dailyToIntervals(payload)` produit des intervalles `day` avec `tariff_slot` hp/hc pour `grid_import`
    - Fixtures `tests/fixtures/payloads/*.json` (valides et invalides)
  - Vérifier : `pnpm test tests/unit/domain/ingest/schema tests/unit/domain/ingest/normalize`
  - Fichiers : `src/domain/ingest/schema.ts`, `src/domain/ingest/normalize.ts`

- [x] **T8 — Route `POST /api/v1/ingest`** · M · Dépend de : T5, T6, T7
  - Acceptation :
    - Authentification Bearer, puis parsing Zod, puis normalisation, puis upsert transactionnel dans `meter_state`, `energy_interval`, `weather_daily` (min, max, moyenne, DJU), `tempo_override` (source `ha`), et une ligne dans `ingest_log`
    - Réponses 200 (+ `warnings`), 400 (`errors[].path`), 401
    - Mode quotidien idempotent : 2 envois de la même date donnent une seule ligne par métrique et par créneau
    - Table `category` créée ici (slugs connus requis par l'ingestion) ; son CRUD reste en T19
    - Bloc `fuel` accepté mais signalé `ignored_block` jusqu'à T23 ; la moyenne et le DJU météo sont calculés à la lecture (`t_sum / t_count`)
  - Vérifier : `pnpm test tests/integration/ingest-route`
  - Fichiers : `src/app/api/v1/ingest/route.ts`, `src/server/ingest/persist.ts`, `src/db/schema.ts`

- [x] **T9 — Garde-fous d'ingestion** · S · Dépend de : T8
  - Acceptation :
    - `RateLimiter` (interface + implémentation mémoire à fenêtre glissante) : 120 req/min par token → 429 + `Retry-After`
    - Corps > 64 Ko → 413 ; mode du payload ≠ `household.granularity` → 409 avec message explicite
    - Réglages : choix horaire/quotidien ; nav et header affichent « Dernier push il y a X min » (réel)
  - Vérifier : `pnpm test tests/integration/ingest-guards`
  - Fichiers : `src/server/rate-limit.ts`, `src/app/api/v1/ingest/route.ts`, `src/components/nav/ha-status.tsx`

- [ ] **T10 — Blueprint Home Assistant** · S · Dépend de : T8
  - Acceptation :
    - `homeassistant/blueprints/wattsup_push.yaml` : sélecteurs `entity` pour chaque métrique (optionnels sauf l'import réseau), liste slug → entité pour les catégories, choix de granularité, entités `unavailable` ou `unknown` omises
    - `homeassistant/README.md` : `rest_command` + `secrets.yaml`, pas à pas, mode horaire et mode quotidien (utility_meter HP/HC)
  - Vérifier : sur l'instance HA d'Alexandre, après T11, une exécution manuelle de l'automatisation renvoie un 200 et `ingest_log` affiche `ok`
  - Fichiers : `homeassistant/blueprints/wattsup_push.yaml`, `homeassistant/README.md`

- [x] **T11 — Docker et déploiement Coolify** · S · Dépend de : T8
  - Acceptation :
    - `Dockerfile` multi-stage (Next `output: standalone`, utilisateur non-root) ; migrations appliquées au démarrage ; `GET /api/health`
    - `docker-compose.yml` complet (app + db) ; `.env.example` documenté
    - Coolify : projet « WattsUp Energy », application Dockerfile, domaine `wattsup-energy.kraftpunk.app`, HTTPS ; base `wattsup` (utilisateur dédié) sur la ressource partagée `postgres-partage`, ajoutée aux sauvegardes nocturnes et à `check-backups`
  - Vérifier : `docker compose up --build` sur une base vide → inscription OK ; `curl https://wattsup-energy.kraftpunk.app/api/health` → 200
  - Fichiers : `Dockerfile`, `docker-compose.yml`, `src/app/api/health/route.ts`, `scripts/migrate.ts`

### ✅ Checkpoint B : le HA d'Alexandre pousse chaque heure vers `wattsup-energy.kraftpunk.app`. Revue de `ingest_log` sur 24 h (resets, avertissements, trous).

---

## Jalon 2 : Moteur tarifaire et contrats

> T12–T14 sont du domaine pur et peuvent démarrer dès T1.

- [x] **T12 — Moteur tarifaire Base et HP/HC** · M · Dépend de : T1
  - Acceptation :
    - Types `Contract`, `PricedResult` ; `priceIntervals(intervals, contract, ctx)` → centimes, détail par mois et par créneau
    - Base ; HP/HC avec plusieurs plages, y compris à cheval sur minuit ; abonnement proratisé au jour ; intervalles `day` déjà ventilés en hp/hc pris tels quels
    - Année synthétique (1 kWh/h, générée dans le test) avec résultats attendus calculés à la main : écart ≤ 1 centime ; cas des changements d'heure. La fixture de données réelles anonymisées viendra au checkpoint C
  - Vérifier : `pnpm test tests/unit/domain/tariff`
  - Fichiers : `src/domain/tariff/types.ts`, `src/domain/tariff/engine.ts`, `src/domain/tariff/pricer.ts`, `src/domain/tariff/base-hphc.ts`, `src/lib/time.ts`

- [x] **T13 — Tarif Tempo** · S · Dépend de : T12
  - Acceptation :
    - 6 prix, HC de 22 h à 6 h, jour Tempo de 6 h à 6 h (0–6 h appartient à la veille)
    - `colorOf` injecté ; jour inconnu → bleu + compteur `assumedDays`
    - En mode quotidien : HC/HP du jour × couleur
  - Vérifier : `pnpm test tests/unit/domain/tariff/tempo`
  - Fichiers : `src/domain/tariff/tempo.ts`

- [x] **T14 — Tarif Custom** · S · Dépend de : T12
  - Acceptation :
    - Règles ordonnées `{ days, ranges, price }` ; la première règle qui correspond s'applique ; un trou de couverture est une erreur de validation
    - Fixture Zen Week-End : écart ≤ 1 centime
  - Vérifier : `pnpm test tests/unit/domain/tariff/custom`
  - Fichiers : `src/domain/tariff/custom.ts`

- [x] **T15 — Seed de démo** · S · Dépend de : T8
  - Acceptation :
    - `pnpm db:seed` crée l'utilisateur `demo@wattsup.local` (identifiants `DEMO_EMAIL` / `DEMO_PASSWORD` de `.env.example`), son foyer (profil complet, commune Nantes), 2 ans horaires générés de façon déterministe (saisonnalité, solaire 3,2 kWc calé sur l'irradiation, batterie 5,12 kWh, chauffe-eau routé, appoint électrique), les postes et la météo (sans écraser les données Open-Meteo réelles) ; refusé en production sauf `--force`
    - Les contrats de référence, les événements de combustibles et les équipements seront ajoutés au seed par T17, T23 et T28, quand leurs tables existeront
    - Idempotent : relancer le seed remplace les données du foyer démo
  - Vérifier : `pnpm db:seed && pnpm test tests/integration/seed`
  - Fichiers : `scripts/seed.ts`, `scripts/seed/generate.ts` (pur, testé), `scripts/seed/seed.ts`

- [x] **T16 — Synchronisation du calendrier Tempo** · M · Dépend de : T2
  - Acceptation :
    - Tables `tempo_calendar` (globale) et `tempo_override` (par foyer) ; `resolveTempoColor(householdId, date)` vérifie la surcharge puis le calendrier
    - `CommunityTempoSource` (api-couleur-tempo.fr) avec timeout de 5 s et 3 essais ; repli sur `data/tempo-seed.json` ; `TEMPO_SYNC=off` = aucun appel réseau
    - `pnpm tempo:sync` (rattrapage depuis la dernière date connue, saison par saison) ; planificateur intégré au serveur : passage au démarrage puis à 11:30 et 17:00
  - Vérifier : `pnpm test tests/integration/tempo-sync tests/unit/domain/tempo-calendar tests/unit/server/tempo-community` (source et fetch factices, aucun appel réel) ; manuel : `tempo_calendar` rempli sur 5 saisons sur l'instance Coolify
  - Fichiers : `src/server/tempo/source.ts`, `src/server/tempo/community.ts`, `src/server/tempo/sync.ts`, `scripts/tempo-sync.ts`, `data/tempo-seed.json`

- [x] **T16b — Météo Open-Meteo** · M · Dépend de : T2, T16
  - Acceptation :
    - `household.location` `{label, lat, lon}` (arrondi à 0,01°) ; recherche de commune par l'API de géocodage Open-Meteo (Server Action, résultats limités à la France en priorité) ; Réglages › Localisation
    - Table `weather_daily` **globale par maille** (`lat_e2`, `lon_e2`, `date`) avec `t_min`, `t_max`, `t_mean`, `sunshine_s`, `radiation_mj_m2`, `source` ; migration qui retire l'ancienne table par foyer alimentée par HA
    - `OpenMeteoSource` derrière `WeatherSource` : *forecast* (`past_days=3`, `timezone=Europe/Paris`) et *archive* (jusqu'à 3 ans en arrière à l'enregistrement de la localisation) ; timeout de 10 s, 3 essais ; une requête par maille, jamais d'identifiant envoyé
    - Planificateur intégré au serveur (`src/server/scheduler.ts`) : passage au démarrage puis chaque jour à partir de 07:00 ; `pnpm weather:sync` (et `--backfill <lat> <lon>`) à la main ; `WEATHER_SYNC=off` = aucun appel sortant ; seuls les jours terminés sont stockés
    - Ingestion : le bloc `weather` est **supprimé** du schéma Zod, de la persistance et des fixtures (aucun code mort ; les clés inconnues étant ignorées, ce n'est pas une rupture). Blueprint et automatisation d'Alexandre : déjà faits le 2026-10-03
    - Domaine : `dju(t_mean)`, conversions (s → h, MJ/m² → kWh/m²)
  - Vérifier : `pnpm test tests/integration/weather-sync tests/unit/domain/weather tests/unit/server/open-meteo` (source et fetch factices, aucun appel réel ; MSW inutile) ; manuel : sur l'instance Coolify, la commune d'Alexandre a 3 ans d'historique et la veille arrive chaque matin
  - Fichiers : `src/server/weather/source.ts`, `src/server/weather/open-meteo.ts`, `src/server/weather/sync.ts`, `scripts/weather-sync.ts`, `src/app/(app)/reglages/location-card.tsx`, `src/domain/weather.ts`

- [x] **T17 — CRUD des contrats** · M · Dépend de : T12, T13, T14
  - Acceptation :
    - Éditeur par type (Base / HP-HC avec plages multiples / Tempo à 6 prix / Custom à règles), validé par Zod
    - Actions : créer, modifier, dupliquer, supprimer, « définir comme actuel » (un seul contrat actuel par foyer)
    - Offres de référence (Base, HP/HC 22 h–6 h, Tempo, Week-end réduit) pour démarrer la saisie, présentées comme indicatives ; le premier contrat créé devient l'actuel ; le seed de démo les reprend (HP/HC actuel)
  - Vérifier : `pnpm test tests/integration/contracts` (+ isolation)
  - Fichiers : `src/server/actions/contracts.ts`, `src/app/(app)/contrats/contract-editor.tsx`, `src/domain/tariff/schema.ts`

- [ ] **T18 — Écran Contrats** · M · Dépend de : T16, T17
  - Acceptation :
    - Coût simulé de chaque contrat sur les 12 derniers mois glissants ; écart avec le contrat actuel ; encart du contrat le plus économique (avec nombre de jours rouges et de jours supposés) ; badge de couverture
    - Bandeau « simulation approximative » en mode quotidien pour un contrat HP/HC dont les plages diffèrent de celles du contrat actuel
    - Calendrier Tempo de la période avec la source de chaque jour ; correction manuelle d'un jour (`tempo_override` en source `manual`)
  - Vérifier : sur le seed, le classement et les montants égalent `priceIntervals` (test d'intégration) ; manuel à 390 px
  - Fichiers : `src/app/(app)/contrats/page.tsx`, `src/server/queries/contracts.ts`, `src/app/(app)/contrats/tempo-calendar.tsx`

### ✅ Checkpoint C : les 4 contrats de référence sont exacts à 1 centime près ; Tempo est simulé sur les données HP/HC réelles d'Alexandre.

---

## Jalon 3 : Vue d'ensemble, postes et historique

- [ ] **T19 — Postes de consommation** · S · Dépend de : T4
  - Acceptation :
    - CRUD : nom, slug (généré, modifiable, unique par foyer), icône (jeu d'icônes intégré), couleur, case `is_heating`
    - Le slug est affiché avec un bouton « copier pour HA » ; une clé inconnue dans le payload renvoie un avertissement (déjà géré en T8, test ajouté)
  - Vérifier : `pnpm test tests/integration/categories` (+ isolation)
  - Fichiers : `src/server/actions/categories.ts`, `src/app/(app)/reglages/categories-card.tsx`

- [ ] **T20 — Vue d'ensemble** · M · Dépend de : T12, T15, T16b, T19
  - Acceptation :
    - Requêtes agrégées par mois et par jour dans le fuseau du foyer ; périodes issues des données (navigation ‹ › mois/année)
    - Cartes : budget toutes sources (élec via le moteur, combustibles au prix moyen pondéré), KPI solaire/batterie/réseau conditionnés au profil, coût mensuel par source avec détail du mois sélectionné, origine de la conso (le jour en mode quotidien), postes
    - Si le solaire est actif : carte « Production et ensoleillement » (30 jours, barres de production et courbe des heures d'ensoleillement, rendement du mois en kWh par kWh/m², comparé à N-1)
  - Vérifier : test d'intégration sur le seed (total de la vue = somme moteur + combustibles) ; manuel à 1280 et 390 px
  - Fichiers : `src/server/queries/overview.ts`, `src/app/(app)/page.tsx`, `src/components/charts/stacked-bars.tsx`, `src/components/cards/*`

- [ ] **T21 — États vides et couverture** · S · Dépend de : T20
  - Acceptation :
    - Composants `<EmptyState>` (CTA : connecter HA / importer un CSV) et `<CoverageBadge>` (% d'heures ou de jours reçus)
    - Un foyer sans données n'affiche aucun `NaN`, `Infinity` ou graphe vide
  - Vérifier : test e2e « foyer neuf » ; manuel
  - Fichiers : `src/components/empty-state.tsx`, `src/components/coverage-badge.tsx`

- [ ] **T22 — Import CSV** · M · Dépend de : T8
  - Acceptation :
    - Format de la spec §7.7 ; parsing en flux ; validation ligne à ligne ; upsert par lots de 5 000 avec `source = csv` ; ne jamais écraser une ligne `ha`
    - UI : dépôt de fichier, aperçu des 10 premières lignes, progression, rapport (lignes OK / rejetées + motifs, téléchargeable) ; limites de 20 Mo et 500 k lignes
    - `docs/csv-format.md`
  - Vérifier : `pnpm test tests/integration/csv-import` (8 760 lignes en < 10 s ; lignes invalides comptées)
  - Fichiers : `src/server/csv/import.ts`, `src/domain/ingest/csv.ts`, `src/app/(app)/reglages/csv-card.tsx`, `docs/csv-format.md`

### ✅ Checkpoint D : sur l'instance Coolify, connecter HA puis importer 2024 affiche le budget complet.

---

## Jalon 4 : Chauffage et prévision

- [ ] **T23 — Domaine combustibles** · S · Dépend de : T1
  - Acceptation :
    - `currentStock(events, at)` = dernier snapshot + achats − consommations depuis
    - `seasonConsumption(events, season)` ; `weightedAvgPrice(purchases)`
    - Conversions sac/palette/kg/stère selon les réglages
  - Vérifier : `pnpm test tests/unit/domain/heating/fuel`
  - Fichiers : `src/domain/heating/fuel.ts`

- [ ] **T24 — Saisie rapide des combustibles** · M · Dépend de : T23, T4
  - Acceptation :
    - « + Sac versé » : 1 tap = 1 événement `consumption`, toast « Annuler » pendant 10 s ; « + ½ stère » pour le bois
    - Feuilles « Achat » (quantité + unité + prix total + date) et « Corriger le stock » (crée un `stock_snapshot`)
    - Journal des 20 derniers événements, modifiables et supprimables ; stepper de stock = stock calculé
  - Vérifier : `pnpm test tests/integration/fuel-events` (+ isolation) ; manuel sur mobile
  - Fichiers : `src/server/actions/fuel.ts`, `src/app/(app)/chauffage/quick-actions.tsx`, `src/app/(app)/chauffage/fuel-log.tsx`

- [ ] **T25 — DJU, équivalences et coût de chauffe (domaine)** · S · Dépend de : T12, T16b, T23
  - Acceptation :
    - DJU de saison (base 18 °C, `t_mean` Open-Meteo, bornes de saison paramétrables)
    - Équivalences kWh (4,8 kWh/kg, sac de 15 kg, 1 800 kWh/stère, modifiables)
    - Coût de chauffe = catégories `is_heating` passées au moteur + combustibles au prix moyen pondéré
  - Vérifier : `pnpm test tests/unit/domain/heating`
  - Fichiers : `src/domain/heating/dju.ts`, `src/domain/heating/cost.ts`

- [ ] **T26 — Vue Chauffage** · M · Dépend de : T24, T25
  - Acceptation :
    - KPI (coût de la saison, granulés et bois consommés avec N-1, température moyenne) ; graphe coût empilé + courbe de température ; ligne d'équivalence kWh et DJU
    - Tout est conditionné à `visibleModules` (aucune trace de bois si le bois est désactivé)
  - Vérifier : e2e profil « granulés seuls » ; manuel
  - Fichiers : `src/app/(app)/chauffage/page.tsx`, `src/server/queries/heating.ts`, `src/components/charts/bars-with-line.tsx`

- [ ] **T27 — Prévision de réapprovisionnement** · M · Dépend de : T25, T26
  - Acceptation :
    - `forecastRefill()` (spec §7.5) : consommation par DJU sur N-1 et N-2, scénarios 0,90 / 1,00 / 1,15, arrondi à la palette (66 sacs par défaut) ou au demi-stère, coût au dernier prix d'achat
    - Encart UI : onglets Granulés / Bois si les deux sont actifs, scénario, base de calcul, phrase de synthèse ; état « données insuffisantes »
  - Vérifier : `pnpm test tests/unit/domain/heating/forecast` ; le parcours PRD 2 est reproduit sur le seed
  - Fichiers : `src/domain/heating/forecast.ts`, `src/app/(app)/chauffage/forecast-card.tsx`

### ✅ Checkpoint E : parcours PRD 1 et 2 validés manuellement sur mobile.

---

## Jalon 5 : Rentabilité

- [ ] **T28 — Équipements et réglages solaire/batterie** · S · Dépend de : T4
  - Acceptation :
    - Feuille « Modifier l'équipement » : libellé libre, capacité, date d'installation, coût
    - Réglages : « Je revends mon surplus » + prix ; « Batterie chargée depuis le réseau » (désactivé par défaut)
  - Vérifier : `pnpm test tests/integration/equipment` (+ isolation)
  - Fichiers : `src/server/actions/equipment.ts`, `src/app/(app)/rentabilite/equipment-sheet.tsx`, `src/app/(app)/reglages/solar-battery-card.tsx`

- [ ] **T29 — ROI solaire et batterie (domaine)** · S · Dépend de : T12, T16b, T28
  - Acceptation :
    - Formules de la spec §7.2–7.3 ; prix du kWh évité au créneau via le moteur sur le contrat actuel
    - Rendement solaire normalisé : kWh produits ÷ kWh/m² reçus (irradiation Open-Meteo), par jour et par mois ; écart au rendement de référence (médiane des 12 derniers mois)
    - Tests sur les 4 combinaisons revente × charge réseau ; projection de la date d'amortissement (économie moyenne sur 12 mois)
  - Vérifier : `pnpm test tests/unit/domain/roi`
  - Fichiers : `src/domain/roi/solar.ts`, `src/domain/roi/battery.ts`

- [ ] **T30 — Écran Rentabilité** · M · Dépend de : T29
  - Acceptation :
    - Carte par équipement actif : jauge % amorti, économies cumulées et mensuelles, frise de l'installation à l'amortissement, statut
    - Ligne « dont revente » seulement si la revente est activée ; mention si la charge réseau est active
    - Carte solaire : rendement normalisé du mois et alerte si la production est sous le rendement attendu pour l'ensoleillement reçu (seuil de −15 %)
  - Vérifier : e2e parcours PRD 3 ; manuel
  - Fichiers : `src/app/(app)/rentabilite/page.tsx`, `src/server/queries/roi.ts`, `src/components/charts/ring-gauge.tsx`

### ✅ Checkpoint F : toutes les fonctionnalités V1 sont en ligne sur `wattsup-energy.kraftpunk.app`.

---

## Jalon 6 : Onboarding, finitions, release

- [ ] **T31 — Onboarding** · M · Dépend de : T9, T16b, T17, T22
  - Acceptation :
    - 5 étapes, reprenables : profil → commune (météo) → contrat actuel → HA (token, téléchargement du blueprint, attente du 1er push en direct) → CSV facultatif
    - Affiché à la première connexion ; peut être sauté ; relançable depuis Réglages
  - Vérifier : e2e « compte neuf → dashboard alimenté »
  - Fichiers : `src/app/(app)/bienvenue/*`, `src/server/actions/onboarding.ts`

- [ ] **T32 — Réglages restants et compte** · M · Dépend de : T9
  - Acceptation :
    - Section Combustibles (poids du sac, sacs par palette, saison, facteurs kWh) ; journal des 20 derniers pushes
    - Compte : changement de mot de passe ; suppression du compte qui efface toutes les données du foyer (cascade testée)
    - `SIGNUP_MODE=open|invite|closed` respecté par `/inscription`
  - Vérifier : `pnpm test tests/integration/account` (aucune ligne restante après suppression)
  - Fichiers : `src/app/(app)/reglages/*`, `src/server/actions/account.ts`, `src/server/auth.ts`

- [ ] **T33 — E2E, charge, Lighthouse** · M · Dépend de : T31
  - Acceptation :
    - Playwright : parcours PRD 1–3, onboarding, copie du token ; 5 profils × 2 viewports (1280, 390) sans aucun élément d'un module désactivé
    - Charge : 10 000 pushes → 0 erreur 5xx, p95 < 150 ms, 429 au-delà de 120 req/min (`scripts/load-ingest.ts`)
    - Lighthouse mobile : Performance ≥ 85, Accessibilité ≥ 95, pas de scroll horizontal
  - Vérifier : `pnpm test:e2e && pnpm tsx scripts/load-ingest.ts`
  - Fichiers : `e2e/*.spec.ts`, `playwright.config.ts`, `scripts/load-ingest.ts`

- [ ] **T34 — Documentation et release** · S · Dépend de : T33
  - Acceptation :
    - `README.md` (install Docker / Coolify, configuration HA), `docs/api.md`, `CONTRIBUTING.md`
    - Image Docker publiée (GHCR) ; tag `v1.0.0` ; prod sur `wattsup-energy.kraftpunk.app` avec les données de recette conservées
  - Vérifier : installation depuis le README seul sur une machine vierge
  - Fichiers : `README.md`, `docs/api.md`, `CONTRIBUTING.md`, `.github/workflows/release.yml`

### ✅ Checkpoint final : les 8 critères de réussite de la spec §13 sont vérifiés. Revue finale avec Alexandre.

---

## Dépendances à valider avant la phase 4 (« Demander d'abord »)

| Paquet | Usage | Tâche |
|---|---|---|
| `next`, `react`, `typescript`, `tailwindcss` | socle | T1 |
| `drizzle-orm`, `drizzle-kit`, `postgres` | DB | T2 |
| `better-auth` | auth | T2 |
| `zod` | validation | T4, T7 |
| `vitest`, `@vitest/coverage-v8`, `msw`, `@playwright/test` | tests (dev) | T1, T16, T33 |
| `csv-parse` | parsing CSV en flux | T22 |
| `tsx` | exécution des scripts | T2 |
