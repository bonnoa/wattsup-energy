# Spec : WattsUp Energy — V1 (MVP)

> Statut : **validée** (phase 1 « Specify »), réponses du 2026-10-02 intégrées.
> Sources : [PRD](./PRD%20HA%20energy%20analyze.md) · maquette [`wattsup-energy-app-design/project/WattsUpApp.dc.html`](./wattsup-energy-app-design/project/WattsUpApp.dc.html)
> Dernière mise à jour : 2026-10-02

---

## 1. Objectif

Application web open source (SaaS + auto-hébergeable) qui reçoit les données énergétiques **poussées** par Home Assistant, puis :

1. affiche le budget énergie mensuel et annuel, toutes sources confondues ;
2. simule le coût de la consommation réelle sur plusieurs contrats (Base, HP/HC, Tempo, complexes) et désigne le moins cher ;
3. calcule le ROI de l'installation solaire et de la batterie ;
4. consolide le coût de chauffe (électricité dédiée + granulés + bois) face à la météo locale ;
5. prévoit les achats de combustible pour la saison suivante ;
6. masque tout module non déclaré dans le profil énergétique.

**Utilisateur cible :** le « maker » domotique (persona Alex du PRD) : HA, Enphase, routeur solaire, batterie Marstek, poêle à granulés et/ou bois. Il refuse d'ouvrir des ports entrants.

### Récits utilisateur et critères d'acceptation

| # | En tant que… | Je veux… | Accepté quand… |
|---|---|---|---|
| US-1 | nouvel utilisateur | créer un compte et un foyer | inscription email + mot de passe → foyer créé automatiquement, onboarding « profil énergétique » affiché |
| US-2 | utilisateur | connecter HA sans ouvrir de port | Réglages affichent l'endpoint + un token copiable ; le blueprint HA du repo, une fois configuré, produit un `200` et « Dernier push il y a X min » se met à jour |
| US-3 | utilisateur en mode quotidien | n'envoyer qu'un agrégat par jour | réglage « Granularité : horaire / quotidienne » ; en quotidien, HA envoie HP kWh et HC kWh du jour et les coûts sont calculés sans perte |
| US-4 | utilisateur sans bois | ne jamais voir de stères | profil « Bois » désactivé → aucune occurrence de bois (nav, KPI, graphes, légendes, prévision) sur les 5 écrans |
| US-5 | utilisateur sans solaire ni batterie | ne pas voir l'onglet Rentabilité | onglet retiré de la nav desktop et mobile ; l'URL `/rentabilite` redirige vers `/` |
| US-6 | utilisateur | comparer mon contrat actuel à d'autres | écran Contrats : coût annuel simulé par contrat sur les 12 derniers mois réels, écart en € vs contrat « Actuel », encart du contrat le plus économique |
| US-7 | utilisateur | savoir combien de granulés commander | saisie du stock + choix du scénario (doux / moyen / rigoureux) → quantité arrondie à la palette ou au demi-stère, phrase de synthèse et coût estimé |
| US-8 | utilisateur | suivre l'amortissement solaire et batterie | saisie du coût initial → jauge % amorti, économies cumulées, économie mensuelle, date d'amortissement projetée |
| US-9 | utilisateur | charger mon historique | import CSV → aperçu, validation, progression, rapport (lignes importées / rejetées avec motif) |
| US-10 | utilisateur | créer mes postes de consommation | CRUD postes avec icône et couleur ; un poste peut être marqué « chauffage » ; chaque poste correspond à une clé du payload |

---

## 2. Choix techniques

| Domaine | Choix | Notes |
|---|---|---|
| Langage | TypeScript 5 (strict) | |
| Framework | **Next.js 15** (App Router, Server Components, Route Handlers) | web et API dans un seul conteneur |
| ORM / migrations | **Drizzle ORM** + `drizzle-kit` | migrations SQL versionnées dans le repo |
| Base de données | **PostgreSQL 16** | pas de TimescaleDB en V1 (cf. §5) |
| Auth | **Better Auth** (email + mot de passe, sessions cookie) | |
| Validation | **Zod** | schéma partagé entre l'API d'ingestion, le CSV et les formulaires |
| UI | Tailwind CSS 4, tokens de la maquette ; graphiques en SVG maison (comme la maquette) | pas de librairie de graphiques au départ |
| Polices | Instrument Sans (texte), JetBrains Mono (chiffres) via `next/font` | |
| Tests | Vitest (unitaires et intégration), Playwright (e2e) | Postgres de test via Docker |
| Paquets | pnpm 9 | |
| Déploiement | Image Docker unique + `docker-compose.yml` (app + postgres) ; Coolify | |

### Tokens de design (issus de la maquette)

```
--bg:        #F4F2EC   --surface: #FFFFFF   --ink: #16181A    --muted: #6B6F68
--border:    #E4E0D6   --track:   #EFECE4   --chip-bg: #E9E5DC
--grid:      #3D5A80   --solar:   #E0A21B   --battery: #2A9D74
--pellet:    #B5652B   --wood:    #6F4A2E   --eheat:   #C8442F
--positive:  #1F7A59   (deltas favorables)  --negative: #C8442F
```
La maquette est une **référence de principe** : on garde la palette, la typographie, la hiérarchie et le ton. Les écrans évoluent librement selon le §9.

Layout : sidebar sombre de 232 px au-dessus de 1024 px ; header + barre d'onglets en bas en dessous (cibles ≥ 44 px). Contenu limité à 1 120 px de large. Rayons de 14 px pour les cartes, 10 px pour les contrôles.

---

## 3. Commandes

```bash
pnpm install
pnpm dev                       # Next.js en dev sur :3000
pnpm build && pnpm start       # build + serveur de production
pnpm lint                      # eslint + tsc --noEmit
pnpm format                    # prettier --write .
pnpm test                      # vitest run
pnpm test:watch                # vitest
pnpm test:coverage             # vitest run --coverage
pnpm test:e2e                  # playwright test
pnpm db:generate               # drizzle-kit generate (nouvelle migration)
pnpm db:migrate                # drizzle-kit migrate
pnpm db:seed                   # foyer démo + 2 ans de données synthétiques
pnpm tempo:sync                # récupère les couleurs Tempo manquantes (communautaire → seed)
docker compose up -d db        # Postgres local pour dev et tests
docker compose up --build      # stack complète (app + db)
```

---

## 4. Structure du projet

```
/
├─ src/
│  ├─ app/
│  │  ├─ (auth)/connexion, inscription
│  │  ├─ (app)/                    → layout avec nav adaptative
│  │  │  ├─ page.tsx               → Vue d'ensemble
│  │  │  ├─ chauffage/
│  │  │  ├─ rentabilite/
│  │  │  ├─ contrats/
│  │  │  └─ reglages/
│  │  └─ api/
│  │     ├─ auth/[...all]/         → Better Auth
│  │     └─ v1/ingest/route.ts     → endpoint d'ingestion
│  ├─ components/                  → UI (cartes, graphiques SVG, segmented control…)
│  ├─ db/
│  │  ├─ schema.ts                 → schéma Drizzle
│  │  └─ index.ts
│  ├─ domain/                      → logique PURE, sans I/O, testée à fond
│  │  ├─ tariff/                   → moteur tarifaire (base, hphc, tempo, custom)
│  │  ├─ ingest/                   → normalisation payload → intervalles
│  │  ├─ roi/                      → solaire, batterie
│  │  ├─ heating/                  → DJU, équivalences kWh, prévision
│  │  └─ profile.ts                → règles de visibilité des modules
│  ├─ server/                      → accès DB, server actions, rate-limit, auth helpers
│  └─ lib/                         → formatage fr-FR, dates Europe/Paris, utils
├─ drizzle/                        → migrations SQL générées
├─ data/tempo-seed.json            → amorçage de l'historique Tempo (repli hors-ligne)
├─ scripts/tempo-sync.ts           → synchronisation du calendrier Tempo
├─ homeassistant/
│  ├─ blueprints/wattsup_push.yaml → blueprint d'automatisation
│  └─ README.md                    → installation côté HA (rest_command + secrets)
├─ tests/
│  ├─ unit/                        → miroir de src/domain
│  ├─ integration/                 → route ingest, import CSV, isolation tenant (vraie DB)
│  └─ fixtures/                    → payloads JSON, CSV, grilles tarifaires de référence
├─ e2e/                            → Playwright
├─ docs/                           → PRD, SPEC, maquette, format CSV, API
├─ Dockerfile
└─ docker-compose.yml
```

---

## 5. Modèle de données (PostgreSQL)

Toutes les tables métier portent `household_id` (FK, `ON DELETE CASCADE`). **Aucune requête métier ne passe sans** : le helper `getHouseholdContext()` est le seul point d'accès.

| Table | Rôle | Colonnes clés |
|---|---|---|
| `user`, `session`, `account`, `verification` | Better Auth | — |
| `household` | foyer (1 par user en V1) | `id`, `owner_id`, `name`, `timezone` (défaut `Europe/Paris`), `granularity` (`hourly`\|`daily`), `profile` JSONB `{solar,battery,pellet,wood,electricHeating}` |
| `ingest_token` | tokens HA | `id`, `household_id`, `prefix` (affiché), `hash` (sha-256), `created_at`, `last_used_at`, `revoked_at` |
| `ingest_log` | journal des pushes (30 j) | `household_id`, `received_at`, `status`, `error`, `payload_size` |
| `meter_state` | dernier index connu par métrique, pour calculer les deltas | `household_id`, `metric`, `ts`, `value` |
| `energy_interval` | **table de faits** | `household_id`, `start` (timestamptz), `granularity` (`hour`\|`day`), `metric`, `tariff_slot` (`all`\|`hp`\|`hc`), `kwh` numeric(12,4), `source` (`ha`\|`csv`) — PK `(household_id, metric, start, granularity, tariff_slot)` |
| `weather_daily` | météo locale agrégée | `household_id`, `date`, `t_min`, `t_max`, `t_sum`, `t_count` (moyenne et DJU calculés à la lecture) |
| `tempo_calendar` | couleurs Tempo **globales** (partagées entre tous les foyers, donnée publique) | `date` PK, `color` (`bleu`\|`blanc`\|`rouge`), `source` (`rte`\|`community`\|`seed`), `fetched_at` |
| `tempo_override` | couleur poussée par HA ou corrigée à la main, par foyer | `household_id`, `date`, `color`, `source` (`ha`\|`manual`) |
| `category` | postes sur mesure | `id`, `household_id`, `name`, `slug` (clé du payload), `icon`, `color`, `is_heating` |
| `contract` | contrats réels et simulés | `id`, `household_id`, `name`, `kind` (`base`\|`hphc`\|`tempo`\|`custom`), `is_current`, `subscription_eur_year`, `prices` JSONB, `hc_schedule` JSONB, `export_price_eur_kwh`, `valid_from` |
| `fuel_event` | combustibles | `household_id`, `fuel` (`pellet`\|`wood`), `type` (`purchase`\|`stock_snapshot`\|`consumption`), `date`, `qty`, `unit` (`bag`\|`kg`\|`stere`), `price_eur` |
| `equipment` | ROI | `household_id`, `kind` (`solar`\|`battery`), `label`, `installed_on`, `cost_eur`, `meta` JSONB |
| `csv_import` | suivi des imports | `id`, `household_id`, `filename`, `status`, `rows_ok`, `rows_rejected`, `errors` JSONB |

**Métriques (`metric`)** : `grid_import`, `grid_export`, `solar_production`, `battery_charge`, `battery_charge_grid` (optionnelle), `battery_discharge`, `category:<slug>`.

**Réglages du foyer** (JSONB `household.settings`) : `export_enabled`, `export_price_eur_kwh` (défaut 0), `battery_grid_charging` (défaut false), `pellet_bag_kg` (défaut 15), `pellet_bags_per_pallet` (défaut 66), `heating_season` (`10-01`→`04-30`), facteurs kWh.

Index : PK ci-dessus, plus `(household_id, start)` sur `energy_interval`. Volumétrie estimée : environ 7 métriques × 8 760 h, soit ~61 k lignes par foyer et par an. Pas de partitionnement en V1 ; la décision sera revue au-delà de 50 M lignes.

---

## 6. Contrat d'API d'ingestion

`POST /api/v1/ingest`
`Authorization: Bearer wu_<32 octets base62>`
`Content-Type: application/json` · corps ≤ 64 Ko

### 6.1 Mode horaire (`household.granularity = hourly`)

HA envoie les **index cumulés** (capteurs `total_increasing`). Le serveur calcule les deltas, ce qui rend le système robuste aux pushes manqués et permet de simuler **n'importe quelle plage HC** côté serveur.

```json
{
  "version": 1,
  "ts": "2026-10-02T14:00:00+02:00",
  "energy": {
    "grid_import_kwh": 18234.512,
    "grid_export_kwh": 1203.004,
    "solar_production_kwh": 9876.3,
    "battery_charge_kwh": 2011.7,
    "battery_charge_grid_kwh": 0,
    "battery_discharge_kwh": 1840.2
  },
  "categories": { "eau-chaude": 3012.4, "chauffage-electrique": 1450.0 },
  "tempo_color": "bleu",
  "weather": { "outdoor_temp_c": 13.4 },
  "fuel": { "pellet_bags_total": 812, "wood_steres_total": 31.5 }
}
```

Règles :
- Tous les blocs sont optionnels, sauf `version` et `ts`.
- Delta = `value − meter_state.value`. Il est réparti au prorata du temps passé dans chaque heure entre l'index précédent et `ts` (trou < 24 h). Les seaux sont des **heures UTC pleines** : pour un fuseau à décalage entier comme Europe/Paris, elles coïncident avec les heures locales, et les changements d'heure n'ont plus de cas particulier. Le fuseau du foyer ne sert qu'aux agrégats (jour, mois) et aux plages tarifaires.
- Une valeur **inférieure** à l'index précédent est traitée comme un reset : le delta vaut la nouvelle valeur.
- Un trou de plus de 24 h ne crée pas de données : le delta est absorbé et un avertissement est consigné dans `ingest_log`.
- Une clé de `categories` inconnue est ignorée, avec un avertissement dans la réponse.
- La température est stockée en min, max et moyenne par jour, et le DJU est calculé en fin de journée (base 18 °C).

### 6.2 Mode quotidien (`household.granularity = daily`)

HA envoie **les totaux de la veille** (utility_meter quotidiens HP et HC), une fois par jour après minuit.

```json
{
  "version": 1,
  "date": "2026-10-01",
  "grid_import": { "hp_kwh": 6.82, "hc_kwh": 5.31 },
  "grid_export_kwh": 2.4,
  "solar_production_kwh": 11.9,
  "battery_charge_kwh": 3.2,
  "battery_discharge_kwh": 2.9,
  "categories": { "eau-chaude": 2.1 },
  "tempo_color": "bleu",
  "weather": { "t_min": 8.1, "t_max": 17.6, "t_avg": 12.4 },
  "fuel": { "pellet_bags": 1, "wood_steres": 0 }
}
```

Règles :
- `grid_import` vaut `{ hp_kwh, hc_kwh }` (contrat HP/HC ou Tempo) ou `{ kwh }` (contrat Base), jamais un mélange des deux.
- Upsert idempotent par `(date, metric, slot)` : renvoyer la même date écrase les valeurs.
- **Limite connue :** en quotidien, la simulation d'un contrat HP/HC avec une **autre plage HC** que celle du contrat actuel reprend la ventilation HP/HC réelle. L'UI l'indique (« simulation approximative, passez en horaire pour plus de précision »). Base et Tempo restent exacts, Tempo grâce à `tempo_color` et à la ventilation HP/HC.

### 6.3 Réponses

| Code | Cas | Corps |
|---|---|---|
| `200` | accepté | `{ "ok": true, "warnings": [...] }` |
| `400` | JSON invalide / schéma Zod | `{ "ok": false, "errors": [{ "path", "message" }] }` |
| `401` | token absent, invalide ou révoqué | `{ "ok": false }` |
| `409` | payload horaire envoyé alors que le foyer est en quotidien (ou l'inverse) | message explicite |
| `413` | corps > 64 Ko | — |
| `429` | > 120 req/min par token | en-tête `Retry-After` |

Le rate limiting utilise une fenêtre glissante en mémoire, par token (instance unique en V1). Une interface `RateLimiter` permet de brancher Redis ou Postgres plus tard.

---

## 7. Règles métier

### 7.1 Moteur tarifaire (`src/domain/tariff`)
- Entrées : la liste des `energy_interval` de `grid_import` (et `grid_export`), un `contract`, les couleurs Tempo résolues (`tempo_override` puis `tempo_calendar`). Sortie : `{ subscription, energy, export_credit, total, breakdown_by_month, breakdown_by_slot }` en €.
- Types de contrat :
  - **Base** : prix unique.
  - **HP/HC** : `hc_schedule` = liste de plages horaires (ex. `22:00–06:00`, ou plusieurs plages).
  - **Tempo** : 6 prix (bleu, blanc, rouge × HP/HC). HC de 22 h à 6 h. Le jour Tempo va de 6 h à 6 h le lendemain : une heure entre 0 h et 6 h appartient à la couleur de la veille.
  - **Custom** : liste ordonnée de règles `{ jours: [lun..dim], plage, prix }`. Exemple : Zen Week-End.
- Les prix sont saisis **TTC**. Les taxes ne sont pas modélisées séparément en V1 : un champ informatif « taxes incluses » suffit.
- L'abonnement est proratisé au jour sur la période analysée.
- **Contrat actuel au choix** : Base, HP/HC ou Tempo. L'utilisateur coche « Actuel » sur l'un d'eux. Tous les autres types restent disponibles en simulation.
- **Couleurs Tempo**, par ordre de priorité :
  1. couleur poussée par HA (`tempo_color`) ou corrigée à la main → `tempo_override` ;
  2. **calendrier global `tempo_calendar`**, alimenté automatiquement par le serveur (voir §7.8).

  Ce calendrier permet à un utilisateur en HP/HC sans capteur Tempo de simuler Tempo sur ses 12 derniers mois.
- **Jour Tempo encore inconnu** (récent, pas encore dans le calendrier embarqué) : on suppose bleu et un compteur « N jours supposés » s'affiche.
- La comparaison porte sur les 12 derniers mois glissants disposant de données ; un badge indique la couverture (% d'heures présentes).

### 7.2 ROI solaire
- Autoconsommation directe = `solar_production − grid_export − battery_charge_solar`.
- Économies = Σ(autoconsommation directe × prix du kWh évité au créneau, selon le contrat actuel) + Σ(export × `export_price_eur_kwh`).
- **Revente optionnelle** : case « Je revends mon surplus » + prix €/kWh dans Réglages. Désactivée par défaut (prix = 0) : l'export compte alors 0 € et la ligne « dont revente surplus » est masquée.
- Projection : économie mensuelle moyenne sur 12 mois glissants. Date d'amortissement = aujourd'hui + (coût − économies cumulées) / économie mensuelle.

### 7.3 ROI batterie
- **Batterie générique** : aucune hypothèse de marque. La fiche équipement contient un libellé libre (ex. « Marstek Venus 5,12 kWh »), la capacité en kWh, la date d'installation et le coût.
- Réglage « Ma batterie se charge aussi depuis le réseau », **désactivé par défaut** :
  - **désactivé** : toute la charge vient du solaire (`battery_charge_solar = battery_charge`) ;
  - **activé** : HA doit pousser `battery_charge_grid_kwh` en plus, et `battery_charge_solar = battery_charge − battery_charge_grid`.
- Économies = Σ(`battery_discharge` × prix du kWh évité au créneau de décharge) − Σ(`battery_charge_grid` × prix du kWh au créneau de charge) − Σ(`battery_charge_solar` × `export_price`), où le dernier terme représente la revente perdue (0 si pas de revente).
- Même projection que pour le solaire.

### 7.4 Chauffage
- Coût de chauffe = électricité des catégories `is_heating`, valorisée par le moteur tarifaire, + granulés et bois valorisés au **prix moyen pondéré des achats** (`fuel_event.purchase`).
- **Saisie manuelle (mode principal V1)**, conçue pour aller vite sur mobile depuis la vue Chauffage :
  - bouton **« + Sac versé »** (1 tap = 1 événement `consumption` de 1 sac, horodaté maintenant, annulable 10 s) ; pour le bois, « + ½ stère utilisé » ;
  - formulaire **« Achat »** : quantité (sacs, palettes ou stères), prix total, date ;
  - **« Corriger le stock »** : crée un `stock_snapshot` qui fait foi à sa date.
- **Stock courant = dernier `stock_snapshot` + achats − consommations depuis**. Le stepper « Stock restant » de la maquette affiche cette valeur ; le modifier crée un snapshot.
- Consommation de combustible, par ordre de priorité : (1) événements `consumption` saisis, (2) compteur poussé par HA (optionnel, pour ceux qui ont un `input_number`), (3) écarts entre snapshots corrigés des achats.
- **Équivalence kWh** (affichée dans la vue Chauffage), avec des valeurs par défaut modifiables dans Réglages :
  - granulés : 4,8 kWh/kg, **poids du sac paramétrable (défaut 15 kg)** ;
  - bois : 1 800 kWh/stère (feuillu sec, < 20 % d'humidité) ;
  - électrique : 1 kWh = 1 kWh.
- **Saison de chauffe** : du 1er octobre au 30 avril (paramétrable).
- **DJU** = Σ max(0, 18 − t_avg) par jour.

### 7.5 Prévision de réapprovisionnement
```
conso_par_DJU = moyenne(conso_saison / DJU_saison) sur N-1 et N-2 (N-1 seul si une seule saison)
DJU_ref       = moyenne des DJU des saisons connues (ou DJU normal saisi par l'utilisateur)
besoin        = conso_par_DJU × DJU_ref × facteur_scénario   (doux 0,90 · moyen 1,00 · rigoureux 1,15)
à_acheter     = max(0, besoin − stock_courant)
granulés : arrondi à la palette supérieure (sacs/palette paramétrable, défaut 66)
bois     : arrondi au demi-stère supérieur
coût     = à_acheter × dernier prix d'achat connu
```
Sans aucune saison complète, l'encart affiche « Données insuffisantes, il faut au moins une saison de chauffe » et propose l'import CSV.

### 7.6 Visibilité des modules (`src/domain/profile.ts`)
Une **fonction pure unique** `visibleModules(profile)` est utilisée par la nav, les pages et les composants (aucun `if` dispersé dans le code).

| Profil | Effet |
|---|---|
| ni granulés, ni bois, ni chauffage électrique | onglet Chauffage masqué, route redirigée |
| ni granulés, ni bois | encart Prévision masqué |
| granulés **et** bois | onglets « Granulés / Bois » dans la Prévision |
| ni solaire, ni batterie | onglet Rentabilité masqué, route redirigée |
| solaire masqué | KPI Production, segment « Solaire autoconsommé », carte ROI solaire masqués |
| chauffage électrique désactivé | les catégories `is_heating` disparaissent du dashboard |

### 7.7 Import CSV
Format imposé (documenté dans `docs/csv-format.md`) :
```
timestamp,metric,kwh[,tariff_slot]
2024-01-01T00:00:00+01:00,grid_import,0.412
2024-01-01,grid_import,6.82,hp
```
- `timestamp` est en ISO 8601 : avec heure pour un intervalle horaire, date seule pour un intervalle quotidien.
- `metric` prend les valeurs du §5.
- Les valeurs sont des **deltas** (pas des index).
- Limites : 20 Mo et 500 k lignes par fichier. Traitement par lots de 5 000 lignes dans une transaction.
- Une ligne invalide est rejetée avec son motif, sans bloquer le reste.
- Upsert : les doublons sont écrasés, avec `source = csv`.
- Un import HA ultérieur sur la même heure **écrase** la donnée CSV (HA fait foi).

---

### 7.8 Synchronisation du calendrier Tempo
Le serveur interroge des API Tempo publiques. **Aucune donnée utilisateur n'est envoyée** : l'appel porte uniquement sur des dates.

| Ordre | Source | Auth | Usage |
|---|---|---|---|
| 1 | **api-couleur-tempo.fr** (communautaire) | aucune | **source V1** (instance SaaS et auto-hébergée) |
| 2 | `data/tempo-seed.json` | — | amorçage de l'historique à la première migration et repli hors-ligne |
| — | API officielle RTE (OAuth2) | `RTE_CLIENT_ID` / `RTE_CLIENT_SECRET` | **hors V1** : l'interface `TempoSource` permet de l'ajouter sans toucher au reste |

- **Quand** : script `pnpm tempo:sync`, lancé tous les jours à 11:30 et 17:00 (la couleur J+1 est publiée vers 11 h) par une tâche planifiée Coolify, ou par cron dans le `docker-compose`. Au démarrage, une passe de rattrapage complète les trous depuis la dernière date connue.
- **Robustesse** : timeout de 5 s, 3 essais avec backoff, puis bascule sur la source suivante. Un échec n'est jamais bloquant ; le compteur « N jours supposés » couvre les trous.
- **Isolation** : tout l'accès réseau passe par `src/server/tempo/` derrière une interface `TempoSource` ; le domaine reste pur.
- Variable d'env `TEMPO_SYNC=off` pour les instances qui refusent tout appel sortant.

## 8. Blueprint Home Assistant (livré en V1)

`homeassistant/blueprints/wattsup_push.yaml` :
- Entrées (sélecteurs `entity`, jamais d'entités codées en dur) : import et export réseau, production solaire, charge et décharge batterie, température extérieure, couleur Tempo (optionnelle), compteurs combustibles (optionnels), liste de catégories (paires slug → entité), granularité.
- Déclencheur : `time_pattern` toutes les heures (minute 0), ou `time` à 00:05 en mode quotidien.
- Action : `rest_command.wattsup_push`. L'URL et le token vivent dans `secrets.yaml` (README pas à pas).
- Les capteurs `unavailable` ou `unknown` sont omis du payload au lieu d'envoyer 0.

---

## 9. Écrans : adaptation de la maquette

Ce qui est ajouté ou modifié par rapport au prototype pour couvrir la spec :

| Écran | Ajouts / changements |
|---|---|
| **Auth & onboarding** (nouveau) | Connexion et inscription. Assistant en 4 étapes : profil énergétique → contrat actuel (Base / HP/HC / Tempo, prix, plages HC) → connexion HA (token + téléchargement du blueprint + test « en attente du 1er push ») → import CSV facultatif. |
| **États vides** (nouveau, transverse) | Chaque carte gère « aucune donnée » (CTA connecter HA ou importer). Un badge de couverture (% d'heures ou de jours reçus) apparaît sur les calculs. |
| **Vue d'ensemble** | Mois et années issus des données réelles, plus de listes figées. Sélecteur période mois / année avec navigation ‹ ›. En mode quotidien, la carte « Origine de la consommation » passe au jour (pas d'intrajournalier). |
| **Chauffage** | Barre d'actions rapides : **« + Sac versé »** (avec toast d'annulation de 10 s), « + ½ stère », « Achat », « Corriger le stock ». Le stepper de stock affiche le **stock calculé** et le modifier crée une correction. Journal des derniers événements (modifiables et supprimables). Ligne d'équivalence kWh et DJU de la saison. État « données insuffisantes » pour la prévision. |
| **Rentabilité** | Bouton « Modifier » sur chaque carte → feuille équipement (libellé libre, capacité, date d'installation, coût). La ligne « dont revente surplus » n'apparaît que si la revente est activée. Mention « charge réseau incluse » si l'option est active. |
| **Contrats** | Le bouton « + Simuler un nouveau contrat » ouvre un **éditeur** par type (Base, HP/HC avec plages multiples, Tempo avec 6 prix, Custom avec règles jour et plage). Actions dupliquer, supprimer et « définir comme actuel ». Calendrier Tempo de la période avec indicateur de source et correction manuelle d'un jour. Bandeau « simulation approximative » en mode quotidien pour un contrat HP/HC dont les plages diffèrent du contrat actuel. |
| **Réglages** | Sections : Profil énergétique · **Ingestion** (granularité horaire / quotidienne, token avec régénérer et révoquer, journal des 20 derniers pushes, téléchargement du blueprint) · **Solaire & batterie** (revente + prix, charge depuis le réseau) · **Combustibles** (poids du sac, sacs par palette, saison de chauffe, facteurs kWh) · Postes de consommation (icône, couleur, case « chauffage », slug affiché pour HA) · Import CSV (aperçu + rapport d'erreurs) · Compte (mot de passe, suppression du compte et des données). |

Les dimensions, couleurs et composants de base (cartes, segmented control, jauges, barres SVG) reprennent la maquette. Pour les nouveaux écrans, on applique le même langage visuel sans maquette dédiée.

## 10. Style de code

```ts
// src/domain/tariff/tempo.ts : logique pure, pas d'I/O, montants en centimes entiers
import type { EnergyInterval, TempoContract, TempoColor } from "./types";

export function tempoDayFor(start: Date, tz: string): string {
  // Le jour Tempo commence à 6 h : 0 h–6 h appartient à la veille.
  return toLocalDate(addHours(start, -6), tz);
}

export function priceTempoInterval(
  interval: EnergyInterval,
  contract: TempoContract,
  colorOf: (day: string) => TempoColor | undefined,
): { cents: number; assumed: boolean } {
  const day = tempoDayFor(interval.start, contract.timezone);
  const color = colorOf(day);
  const slot = isTempoOffPeak(interval.start, contract.timezone) ? "hc" : "hp";
  const price = contract.prices[color ?? "bleu"][slot];
  return { cents: Math.round(interval.kwh * price * 100), assumed: color === undefined };
}
```

Conventions :
- Code et identifiants en **anglais**, UI et messages utilisateur en **français**.
- `src/domain/**` est pur : pas d'import de `db`, `next` ou `fetch`. Tout I/O passe par `src/server`.
- Calculs monétaires en **centimes entiers**, énergie en `number` kWh, arrondis uniquement à l'affichage.
- Dates : `timestamptz` en base, conversions explicites vers le fuseau du foyer, jamais de `new Date().getHours()` implicite.
- Fichiers en `kebab-case.ts`, composants en `PascalCase.tsx`, une exportation principale par fichier.
- Les formulaires passent par des Server Actions + Zod. Pas d'API REST interne pour l'UI.
- Formatage : Prettier (largeur 100, guillemets doubles), ESLint `next/core-web-vitals` + `@typescript-eslint/strict`.

---

## 11. Stratégie de tests

| Niveau | Outil | Portée | Exigence |
|---|---|---|---|
| Unitaire | Vitest | `src/domain/**` : tarifs (Base, HP/HC multi-plages, Tempo et sa frontière 6 h, changement d'heure été/hiver), deltas d'index et resets, DJU, prévision, ROI, `visibleModules` | **≥ 90 % de lignes** sur `src/domain` ; TDD pour le moteur tarifaire |
| Intégration (Tempo) | Vitest + MSW (HTTP mocké) | `TempoSource` : succès de la source communautaire, repli sur le seed en cas de timeout, de 5xx ou de format inattendu, idempotence de l'upsert, `TEMPO_SYNC=off` = zéro appel réseau | aucun appel réseau réel en CI |
| Intégration | Vitest + Postgres Docker | route `/api/v1/ingest` (200/400/401/409/413/429), idempotence quotidienne, import CSV, **isolation multi-tenant** (le foyer A ne lit ni n'écrit jamais les données du foyer B, testé sur chaque action serveur) | tous les codes de retour couverts |
| E2E | Playwright (Chromium, viewports 1280 et 390) | parcours PRD 1, 2 et 3 + onboarding + copie du token | 1 test par parcours |
| Fixtures de référence | JSON | 1 an de données réelles anonymisées + coût attendu calculé à la main pour 3 contrats | écart ≤ 0,01 € |

Les tests d'intégration démarrent sur une base vide migrée (`pnpm db:migrate` dans `globalSetup`).

---

## 12. Limites (Boundaries)

**Toujours**
- Filtrer chaque requête par `household_id` via `getHouseholdContext()`.
- Valider toute entrée externe (payload, CSV, formulaires) avec Zod.
- Lancer `pnpm lint && pnpm test` avant chaque commit.
- Écrire le test du moteur tarifaire ou de la prévision **avant** l'implémentation.
- Utiliser le format fr-FR et les tokens de la maquette pour l'UI.

**Demander d'abord**
- Toute modification du schéma DB après la première migration validée.
- L'ajout d'une dépendance runtime.
- Toute modification du contrat d'API d'ingestion (`version: 1`) : une rupture impose `version: 2`.
- Le choix d'une librairie de graphiques si le SVG maison ne suffit pas.
- Les changements Docker ou Coolify.

**Jamais**
- Committer un secret ou un token, ou logguer un token en clair (préfixe seulement).
- Stocker un token non haché.
- Interroger l'instance HA de l'utilisateur (pull exclu de la V1).
- Appeler des API tierces en V1 (fournisseurs, météo…), **sauf** les sources Tempo du §7.8, et jamais avec une donnée utilisateur.
- Supprimer ou désactiver un test en échec sans accord.

---

## 13. Critères de réussite V1

1. `docker compose up` sur une machine vierge → app accessible, migrations appliquées, inscription fonctionnelle.
2. Le blueprint HA, configuré avec un vrai token, alimente la Vue d'ensemble en moins de 2 pushes (mode horaire) ou en 1 push (mode quotidien).
3. Le coût simulé de chaque contrat de référence (Base, HP/HC, Tempo, Zen Week-End) sur la fixture d'un an égale le calcul manuel à 0,01 € près.
4. Les 5 combinaisons de profil des tests e2e ne laissent apparaître **aucun** élément d'un module désactivé.
5. Ingestion : p95 < 150 ms sur la route ; 0 erreur 5xx sur 10 000 pushes de charge ; 429 au-delà de 120 req/min.
6. Import d'un CSV de 8 760 lignes en moins de 10 s, avec un rapport exact des lignes rejetées.
7. Lighthouse mobile (390 px) : Performance ≥ 85, Accessibilité ≥ 95 ; aucun scroll horizontal.
8. Test d'isolation tenant vert sur 100 % des actions serveur.

---

## 14. Hors périmètre V1 (rappel PRD)
Pull HA, API des fournisseurs ou de la météo, appli native, foyers multi-membres, alertes de stock (phase 4), vues comparatives annuelles avancées (phase 4).

---

## 15. Décisions issues de la revue (2026-10-02)

| Sujet | Décision |
|---|---|
| Batterie | Générique, sans marque imposée. Charge depuis le réseau en option (désactivée par défaut) ; métrique `battery_charge_grid` utilisée seulement si l'option est active. |
| Revente surplus | Optionnelle, désactivée par défaut ; prix €/kWh saisi par l'utilisateur. |
| Contrat actuel | Base, HP/HC ou Tempo au choix ; les autres en simulation. |
| Couleurs Tempo | Récupération automatique côté serveur (api-couleur-tempo.fr, sinon seed ; RTE officielle reportée après la V1), calendrier global partagé ; capteur HA et correction manuelle prioritaires par foyer. Exception assumée au « pas d'API tierce » du PRD. |
| Licence | **GPL-3.0-or-later**. NB : la GPL n'oblige pas un tiers qui opère un fork en SaaS à publier ses modifications (seule l'AGPL le fait). |
| Maquette | Référence de **principe** (identité visuelle, ton, structure). Les écrans sont adaptés aux fonctionnalités et décisions de cette spec (§9). |
| Granulés et bois | Saisie manuelle prioritaire (« + Sac versé », « Achat », « Corriger le stock ») ; compteur HA optionnel ; poids du sac paramétrable (15 kg par défaut). |
| Hébergement | Projet Coolify **« wattsup »** sur le VPS, domaine **`wattsup-energy.kraftpunk.app`** (app + Postgres). Sert d'instance de recette dès le jalon 1, puis de prod. |
| Inscription SaaS | Variable d'env `SIGNUP_MODE=open\|invite\|closed` (défaut `open` en auto-hébergé). |
| Fiche équipement | Feuille « Modifier l'équipement » ouverte depuis chaque carte ROI (libellé, capacité, date d'installation, coût). |

## 16. Questions ouvertes

Aucune question bloquante.
