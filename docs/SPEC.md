# Spec : WattsUp Energy — V1 (MVP)

> Statut : **validée** (phase 1 « Specify »), réponses du 2026-10-02 intégrées.
> Sources : [PRD](./PRD%20HA%20energy%20analyze.md) · maquette [`wattsup-energy-app-design/project/WattsUpApp.dc.html`](./wattsup-energy-app-design/project/WattsUpApp.dc.html)
> Dernière mise à jour : 2026-10-03 (météo via Open-Meteo, retours du branchement HA réel)

---

## 1. Objectif

Application web open source (SaaS + auto-hébergeable) qui reçoit les données énergétiques **poussées** par Home Assistant, puis :

1. affiche le budget énergie mensuel et annuel, toutes sources confondues ;
2. simule le coût de la consommation réelle sur plusieurs contrats (Base, HP/HC, Tempo, complexes) et désigne le moins cher ;
3. calcule le ROI de l'installation solaire et de la batterie ;
4. consolide le coût de chauffe (électricité dédiée + granulés + bois) face à la météo locale, et met la production solaire en regard de l'ensoleillement ;
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
| Polices | Instrument Sans (texte et chiffres, en chiffres tabulaires `tabular-nums`), JetBrains Mono réservée aux valeurs techniques (jeton, coordonnées, horodatages), auto-hébergées via `next/font/local` | Les prix et montants en mono à petit corps se lisaient mal (retour utilisateur 2026-10-03) |
| Tests | Vitest (unitaires et intégration), Playwright (e2e) | Postgres de test via Docker |
| Paquets | pnpm 9 | |
| Déploiement | Image Docker unique + `docker-compose.yml` (app + postgres) ; Coolify | |

### Tokens de design (issus de la maquette)

```
--bg:        #F4F2EC   --surface: #FFFFFF   --ink: #16181A    --muted: #676B63
--border:    #E4E0D6   --track:   #EFECE4   --chip-bg: #E9E5DC
--grid:      #3D5A80   --solar:   #E0A21B   --battery: #2A9D74
--pellet:    #B5652B   --wood:    #6F4A2E   --eheat:   #C8442F
--positive:  #1F7A59   (deltas favorables)  --negative: #C8442F
--subtle:    #686C64   (texte secondaire ; assombri depuis #8A8E86 pour 4,8:1 sur blanc, T33, puis
             pour 4,5:1 sur les tuiles beiges, T43)
```
Thème sombre (T43) : mêmes noms de tokens redéfinis sous `:root[data-theme="dark"]` (et
`data-theme="auto"` + `prefers-color-scheme: dark`) dans `globals.css` ; aucune couleur codée en
dur dans les composants. Tokens ajoutés : `ink-soft` (texte secondaire marqué), `panel*`
(panneaux sombres dans les deux thèmes : barre latérale, carte Budget, bandeau de comparaison,
toast), `hc`, `subscription`, `neutral-bar`, `dash`, `tempo-white`, `switch-off`,
`warning-bg`, `danger-bg`, `warning-ink`, `solar-ink`, `on-grid` (texte sur le bleu).
Accessibilité (T33) : texte de 11 px à 4,5:1 au moins sur blanc ; pastilles d'alerte en `#9A5322` sur fond orangé ; cibles tactiles espacées de 24 px (calendrier Tempo) ; liens dans un texte soulignés ; logotype « WattsUp Energy » exempté de contraste et lu comme un seul nom.
La maquette est une **référence de principe** : on garde la palette, la typographie, la hiérarchie et le ton. Les écrans évoluent librement selon le §9.

Layout : sidebar sombre de 232 px au-dessus de 1024 px ; header + barre d'onglets en bas en dessous (cibles ≥ 44 px). Contenu limité à 1 120 px de large. Rayons de 14 px pour les cartes, 10 px pour les contrôles.

### Principes d'interface (validés le 2026-10-03, à appliquer à tous les écrans)

Briques partagées dans `src/components/ui` : `Card`, `CardFooter`, `Badge`, `StatTile` (+ `tiles`), `Notice`, `GroupTitle`, `Icon`, classes `button.*`. Un nouvel écran les réutilise plutôt que de recréer ses styles.

1. **Une carte par objet** (contrat, source, poste, campagne…) : pictogramme, titre, pastilles, une ligne de contexte (dates, état), actions secondaires en icônes en haut à droite (modifier, dupliquer, supprimer, avec `aria-label`).
2. **L'élément actif se voit** : contrat en cours, liaison HA connectée… sont encadrés (`highlight`) et portent une pastille explicite. Chaque objet a un **statut en clair** (« En cours », « Terminé », « À venir », « Silencieux »…), calculé par la même règle partout (ex. `pushState`).
3. **Chiffres lisibles** : libellé au-dessus, valeur en gros (17 px, semi-gras), unité à côté, en Instrument Sans `tabular-nums`. Jamais de prix ni de montant en JetBrains Mono ; la mono est réservée aux valeurs techniques (jeton, endpoint, coordonnées). Un montant ambigu est précisé (abonnement en €/mois **et** €/an). Les **tuiles chiffrées sont réservées aux valeurs qui comptent** (stock, coût, prix, économies) ; une information de contrôle (historique disponible, date de dernière mise à jour) tient en une ligne de texte discrète.
4. **Groupes nommés** au-dessus des listes (« Contrat en cours », « Contrats passés », « Offres à comparer »).
5. **Une action principale claire** par carte (bouton plein), les autres en bouton bordé ou en lien discret dans le pied de carte.
6. **Expliquer plutôt que laisser deviner** : quand une donnée semble incohérente ou qu'une étape manque, un encart `Notice` le dit en une phrase et propose la correction en un clic (« C'est toujours mon contrat », « Générer un token »). Les champs piégeux ont une aide sous le champ.
7. **Petites aides visuelles** plutôt que du texte brut (frise de 24 h des heures creuses, barres de comparaison).
8. **Textes génériques** : l'outil sert à tous les foyers ; aucun libellé, exemple ni aide ne suppose un équipement particulier (routeur solaire, marque de batterie ou d'onduleur…). On décrit ce qui est mesuré (« si vous mesurez l'énergie envoyée au ballon »), pas avec quel appareil.
9. Mobile d'abord : tout reste lisible à 325 px (pictogramme de carte masqué, tuiles qui passent à la ligne, montants sans retour à la ligne).

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
pnpm weather:sync              # météo Open-Meteo de la veille (et rattrapage) pour chaque maille de foyers
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
├─ scripts/weather-sync.ts         → synchronisation météo Open-Meteo
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
| `user`, `session`, `account`, `verification` | Better Auth | `user` porte en plus `theme` (`light`\|`dark`\|`auto`, défaut `light`), `is_admin` (administrateur de l'instance : fixé par migration pour `alexandre@bonno.xyz` sur l'instance de référence, jamais saisissable, aucun écran ne le modifie) et `disabled_at` (compte désactivé par l'administrateur : sessions fermées, connexion refusée, envois Home Assistant refusés en 401, données conservées) |
| `household` | foyer (1 par user en V1) | `id`, `owner_id`, `name`, `timezone` (défaut `Europe/Paris`), `granularity` (`hourly`\|`daily`), `profile` JSONB `{solar,battery,pellet,wood,electricHeating}`, `location` JSONB `{label, lat, lon}` (coordonnées arrondies à 0,01°, voir §7.9) |
| `ingest_token` | tokens HA | `id`, `household_id`, `prefix` (affiché), `hash` (sha-256), `created_at`, `last_used_at`, `revoked_at` |
| `ingest_log` | journal des pushes (30 j) | `household_id`, `received_at`, `status`, `error`, `payload_size` |
| `meter_state` | dernier index connu par métrique, pour calculer les deltas | `household_id`, `metric`, `ts`, `value` |
| `energy_interval` | **table de faits** | `household_id`, `start` (timestamptz), `granularity` (`hour`\|`day`), `metric`, `tariff_slot` (`all`\|`hp`\|`hc`), `kwh` numeric(12,4), `source` (`ha`\|`csv`\|`manual`, correction de l'onglet Données) — PK `(household_id, metric, start, granularity, tariff_slot)` |
| `weather_daily` | météo quotidienne **globale par maille** (donnée publique Open-Meteo, partagée entre les foyers d'une même maille de 0,01°) | `lat_e2`, `lon_e2` (coordonnées × 100, entiers), `date`, `t_min`, `t_max`, `t_mean`, `sunshine_s`, `radiation_mj_m2`, `source` (`forecast`\|`archive`), `fetched_at` — PK `(lat_e2, lon_e2, date)`. DJU calculé à la lecture. Remplace la table par foyer alimentée par HA jusqu'à T16b |
| `tempo_calendar` | couleurs Tempo **globales** (partagées entre tous les foyers, donnée publique) | `date` PK, `color` (`bleu`\|`blanc`\|`rouge`), `source` (`rte`\|`community`\|`seed`), `fetched_at` |
| `tempo_override` | couleur poussée par HA ou corrigée à la main, par foyer | `household_id`, `date`, `color`, `source` (`ha`\|`manual`) |
| `category` | postes sur mesure | `id`, `household_id`, `name`, `slug` (clé du payload), `icon`, `color`, `is_heating` |
| `contract` | contrats du foyer : **souscrits** (datés) et **simulés** (offres à comparer) | `id`, `household_id`, `name`, `kind` (`base`\|`hphc`\|`tempo`\|`custom`, fixe), `status` (`subscribed`\|`simulated`), `start_date` et `end_date` (souscrit seulement ; fin vide = en cours). Deux contrats souscrits d'un même foyer ne se chevauchent jamais |
| `contract_period` | **historique des grilles de prix** d'un contrat | `id`, `contract_id`, `household_id`, `valid_from` (date), `config` JSONB (grille complète validée par `parseContractInput`, plages HC comprises). Un contrat a au moins une période ; une période s'applique de `valid_from` jusqu'à la suivante |
| `fuel_event` | combustibles | `household_id`, `fuel` (`pellet`\|`wood`), `type` (`purchase`\|`stock_snapshot`\|`consumption`), `at` (instant : ordre des événements d'un même jour, annulation), `qty`, `unit` (`bag`\|`kg`\|`stere` ; une palette saisie est enregistrée en sacs), `price_eur` (achats) |
| `instance_settings` | réglages de l'instance (ligne unique, `id = 1`), modifiés par l'administrateur | `signup_mode` (`open`\|`invite`\|`closed`), `invite_codes` (séparés par des virgules) ; vides : `SIGNUP_MODE` et `INVITE_CODES` s'appliquent |
| `idea`, `idea_vote` | boîte à idées, **commune à l'instance** (hors foyer) | `idea` : `id`, `author_id` (mis à null si le compte est supprimé : l'idée reste, anonyme), `title` (60 caractères), `description` (1 000), `status` (`new`\|`planned`\|`in_progress`\|`done`), `version` (statut `done`), `created_at` ; `idea_vote` : PK `(idea_id, user_id)`, un vote par compte, supprimé avec le compte ou l'idée |
| `alert_dismissal` | alertes masquées (T44) | `household_id`, `key` (ex. `fuel_stock:pellet`), `level` (1 ou 2), `dismissed_at` — PK `(household_id, key)` ; effacée quand l'alerte n'a plus lieu d'être |
| `alert_notification` | alertes déjà envoyées hors de l'appli | `household_id`, `key`, `channel` (`email`\|`push`), `level`, `sent_at` — PK `(household_id, key, channel)` ; effacée quand l'alerte n'a plus lieu d'être |
| `marker` | repères | `household_id`, `kind` (`equipment`\|`maintenance`\|`absence`\|`other`), `text` (140 caractères au plus), `start_date`, `end_date` (facultative, incluse) |
| `equipment` | ROI | `household_id`, `kind` (`solar`\|`battery`, un par type), `label`, `capacity` (kWc ou kWh), `installed_on`, `cost_eur` |
| `csv_import` | suivi des imports | `id`, `household_id`, `filename`, `status`, `rows_ok`, `rows_rejected`, `errors` JSONB |

**Métriques (`metric`)** : `grid_import`, `grid_export`, `solar_production`, `battery_charge`, `battery_charge_grid` (optionnelle), `battery_discharge`, `category:<slug>`.

**Réglages du foyer** (JSONB `household.settings`) : `alerts` (activation et seuil de chaque alerte, T44 ; absent : valeurs par défaut), `export_enabled`, `export_price_eur_kwh` (défaut 0), `battery_grid_charging` (défaut false), `pellet_bag_kg` (défaut 15), `pellet_bags_per_pallet` (défaut 66), `heating_season` (`10-01`→`04-30`), facteurs kWh.

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
- **Coût d'un push** (T33) : vérification du token en lecture (la date de dernier usage n'est réécrite qu'au-delà de 10 minutes) ; foyer et postes lus en une requête ; index précédents lus et verrouillés en une requête, intervalles et index écrits par lots ; données et journal dans **une seule transaction** (un commit). La purge du journal (30 jours) est une tâche quotidienne du planificateur (03:00), plus une opération par push.
- **Postes de consommation** (T19) : slug proposé à partir du nom (minuscules sans accents, tirets), modifiable, unique par foyer. Changer le slug renomme les données déjà reçues (`energy_interval` et `meter_state`, métrique `category:<slug>`) ; supprimer un poste supprime ses données. Les slugs signalés `unknown_category` par les envois des 7 derniers jours sont proposés à la création dans Réglages (« Créer le poste »). Pictogrammes et couleurs pris dans un jeu fixe (`CATEGORY_ICONS`, tokens de la charte).
- Le bloc `weather` est **retiré du contrat en T16b** (schéma, persistance, table par foyer). Ce n'est pas une rupture : l'API ignore déjà les clés inconnues. La météo vient d'Open-Meteo (§7.9).

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

`weather` : même règle qu'en horaire, retiré du contrat en T16b.

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

### 6.4 Historique à la demande (bloc `backfill`, additionnel)

Même endpoint, même token, même `rest_command` : un envoi qui porte un bloc `backfill` est aiguillé à part, tout autre envoi suit le chemin ordinaire **inchangé**. Lancé dans HA par le script « WattsUp Energy — envoyer l'historique » (blueprint `wattsup_history.yaml`, deux dates), qui déclenche l'automatisation d'envoi (événement `wattsup_backfill`) : elle lit, jour par jour, les statistiques horaires du recorder (`recorder.get_statistics`, type `change`, unités converties en kWh) des capteurs déjà choisis, et les envoie (une requête par jour, une seconde d'écart).

```json
{
  "version": 1,
  "backfill": {
    "metrics": { "grid_import": "sensor.import", "category:chauffe-eau": "sensor.ballon" },
    "statistics": {
      "sensor.import": [{ "start": "2026-03-10T08:00:00+00:00", "end": "…", "change": 0.5 }]
    }
  }
}
```

- `metrics` : compteur WattsUp (§5) → capteur ; `statistics` : réponse brute du recorder.
- **Jamais de remplacement** : une heure (ou un jour) déjà présente pour ce compteur est conservée, quel que soit le créneau (un jour reçu en HP et HC ne reçoit pas de total en plus). Écrit avec `source = ha`.
- **Rejets comptés** : valeur au-delà du seuil de plausibilité (saut de compteur des statistiques), variation négative, hors période (10 ans au plus, heures terminées seulement), poste inconnu de WattsUp.
- Foyer quotidien : heures additionnées par jour local (`tariff_slot = all`), jour terminé seulement.
- Quota de valeurs par foyer partagé avec l'import CSV (§7.7). Journal : mode `backfill` (« historique »), résumé dans les avertissements ; un envoi d'historique ne compte pas comme dernier envoi pour l'état de la liaison.
- Réponse `200` : `{ ok, inserted, existing, rejected: { implausible, negative, outOfRange, unknownCategory }, quotaReached }`.

### 6.5 Décompte d'un combustible (bloc `fuel_event`, additionnel)

Même endpoint, même token, même `rest_command` : `{ "version": 1, "fuel_event": { "fuel": "pellet" | "wood", "qty"?: number } }`. Enregistre une consommation horodatée maintenant, comme le bouton « Sac versé » : 1 sac (granulés) ou ½ stère (bois) par défaut, `qty` sinon (50 au plus). Lancé dans HA par le script « WattsUp Energy — sac versé » (blueprint `wattsup_fuel.yaml`), à brancher sur un bouton ou une automatisation.
- `200` : `{ ok, id, stock, unit }` (stock restant en sacs ou stères, repris dans une notification HA).
- `409` si le combustible n'est pas activé dans le profil du foyer ; `400` pour une forme invalide.
- Journal : mode `fuel` (« combustible ») ; ne compte pas comme dernier envoi pour l'état de la liaison.

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
- **Contrats souscrits et simulés** : un contrat **souscrit** a une date de début (et de fin s'il est terminé) ; un contrat **simulé** n'a pas de dates et ne sert qu'à la comparaison. Le **contrat actuel** est le contrat souscrit dont la période contient aujourd'hui (au plus un, les périodes ne se chevauchant pas). Le type d'un contrat (Base, HP/HC, Tempo, sur mesure) ne change pas ; ses prix, oui.
- **Historique de prix** : chaque contrat porte une suite de grilles datées (`contract_period.valid_from`) : hausse de février ou d'août, déplacement des heures creuses. À une date donnée s'applique la grille la plus récente dont `valid_from` ≤ date ; avant la première, la première grille.
- **Coût réel de l'historique** (Vue d'ensemble, chauffage, rentabilité) : chaque intervalle est valorisé avec le contrat souscrit actif à sa date et la grille en vigueur ce jour-là ; l'abonnement est proratisé par période. Un jour couvert par aucun contrat souscrit est estimé avec la grille actuelle du contrat actuel et compté comme « contrat inconnu ».
- **Comparaison** (écran Contrats) : chaque offre, y compris le contrat actuel, est simulée sur les 12 derniers mois de consommation avec **sa grille actuelle** (ce que coûterait l'offre aujourd'hui). La ligne « Réellement payé » donne le coût réel de la même période, calculé sur l'historique.
- **Couleurs Tempo**, par ordre de priorité :
  1. couleur poussée par HA (`tempo_color`) ou corrigée à la main → `tempo_override` ;
  2. **calendrier global `tempo_calendar`**, alimenté automatiquement par le serveur (voir §7.8).

  Ce calendrier permet à un utilisateur en HP/HC sans capteur Tempo de simuler Tempo sur ses 12 derniers mois.
- **Jour Tempo encore inconnu** (récent, pas encore dans le calendrier embarqué) : on suppose bleu et un compteur « N jours supposés » s'affiche.
- La comparaison porte sur les 12 derniers mois glissants disposant de données ; un badge indique la couverture (% d'heures présentes). Avec un historique plus court, la période démarre à la première donnée et les coûts sont annualisés (« estimation sur N jours ») ; en dessous de 7 jours, l'écran affiche « données insuffisantes ».

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
- Coût de chauffe = électricité des catégories `is_heating`, valorisée par le moteur tarifaire (**énergie seule** : l'abonnement reste au budget électricité), + granulés et bois valorisés au **prix de référence** : moyenne des achats chiffrés (`fuel_event.purchase`) des **12 mois précédant** la fin de la saison (aujourd'hui pour la saison en cours), pondérée par la quantité ; à défaut, le dernier achat chiffré avant, sinon le premier après. Un prix ancien ne pèse donc plus sur les saisons récentes. La tuile « Prix moyen payé » affiche ce prix et son origine ; le journal donne le prix par sac (ou par stère) de chaque achat. Un combustible consommé sans aucun achat chiffré compte ses kWh mais pas de coût, et l'écran le signale.
- **Saisie manuelle (mode principal V1)**, conçue pour aller vite sur mobile depuis la vue Chauffage :
  - bouton **« + Sac versé »** (1 tap = 1 événement `consumption` de 1 sac, horodaté maintenant, annulable 10 s) ; pour le bois, « + ½ stère utilisé » ;
  - formulaire **« Achat »** : quantité (sacs, palettes ou stères), prix total, date ;
  - **« Corriger le stock »** : crée un `stock_snapshot` qui fait foi à sa date.
  - **« Consommation passée »** (journal des combustibles) : le total d'un **mois terminé** (mois et année, quantité), enregistré comme une `consumption` datée du 15 à midi, pour retrouver les saisons d'avant l'appli ; après chaque enregistrement le mois suivant est proposé. Le journal liste les 20 dernières **saisies** (date de saisie), avec l'année quand elle diffère de l'année en cours ; l'heure n'est affichée que pour les événements horodatés (sacs versés, relevés), pas pour les achats datés au jour, et une consommation passée s'affiche « total de janvier 2025 ».
- **Stock courant = dernier `stock_snapshot` + achats − consommations depuis**. Le stepper « Stock restant » de la maquette affiche cette valeur ; le modifier crée un snapshot.
- Consommation de combustible, par ordre de priorité : (1) événements `consumption` saisis, (2) compteur poussé par HA (optionnel, pour ceux qui ont un `input_number`), (3) écarts entre snapshots corrigés des achats.
- **Équivalence kWh** (affichée dans la vue Chauffage), avec des valeurs par défaut modifiables dans Réglages :
  - granulés : 4,8 kWh/kg, **poids du sac paramétrable (défaut 15 kg)** ;
  - bois : 1 800 kWh/stère (feuillu sec, < 20 % d'humidité) ;
  - électrique : 1 kWh = 1 kWh.
- **Saison de chauffe** : du 1er octobre au 30 avril (paramétrable).
- **DJU** = Σ max(0, 18 − t_mean) par jour, avec `t_mean` issue d'Open-Meteo (§7.9).

### 7.5 Prévision de réapprovisionnement
```
conso_par_DJU = moyenne(conso_saison / DJU_saison) sur N-1 et N-2 (N-1 seul si une seule saison)
DJU_ref       = moyenne des DJU des saisons connues (ou DJU normal saisi par l'utilisateur)
besoin        = conso_par_DJU × DJU_ref × facteur_scénario   (doux 0,90 · moyen 1,00 · rigoureux 1,15)
à_acheter     = max(0, besoin − stock_courant)
granulés : arrondi au sac supérieur, avec l'équivalent en palettes entières (sacs/palette paramétrable, défaut 66)
bois     : arrondi au demi-stère supérieur
coût     = à_acheter × dernier prix d'achat connu
```
Sans aucune saison complète, l'encart affiche « Données insuffisantes, il faut au moins une saison de chauffe » et propose de **saisir une consommation passée**.

Échéances (T27) :
- **Fin de cette saison** (en saison seulement) : `reste = max(0, besoin − déjà consommé)`, `à_acheter = max(0, reste − stock)`.
- **Saison prochaine** : le stock encore nécessaire pour finir l'hiver en cours est réservé (`stock_dispo = max(0, stock − reste)`). L'hiver en cours entre dans l'historique pour sa **consommation par DJU** dès que la moitié du froid d'un hiver moyen est passée (fin avril, c'est l'hiver le plus représentatif) ; jamais pour son total, ni sans météo.
- Une saison passée n'est corrigée du froid que si la météo couvre au moins 90 % de ses jours ; sinon, moyenne simple des saisons terminées.
- Les trois scénarios et les deux échéances sont calculés côté serveur ; l'encart affiche une phrase de synthèse, le besoin, le stock retenu, la quantité à acheter et la base de calcul.

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
- **Garde-fous** : dates acceptées du 1er janvier d'il y a 10 ans jusqu'à aujourd'hui (jour local) ; valeur plafonnée au seuil de plausibilité du compteur (§6, × 24 pour une ligne quotidienne), au-delà la ligne est rejetée ; **un import à la fois** et **10 imports par heure** par foyer (refus 429 avec le délai) ; **quota de 2 000 000 valeurs** par foyer, l'import s'arrête en le disant une fois atteint. En complément, `SIGNUP_MODE=invite` est recommandé sur une instance publique.
- Une ligne invalide est rejetée avec son motif, sans bloquer le reste.
- Upsert : un intervalle déjà importé par CSV est remplacé (`source = csv`) ; un intervalle déjà reçu de Home Assistant est **conservé** (compté « gardé de HA » dans le rapport). Dans un même lot, la dernière valeur d'un intervalle l'emporte.
- Un import HA ultérieur sur la même heure **écrase** la donnée CSV (HA fait foi).
- Les lignes suivent la granularité du foyer (horaire ou quotidienne), sinon elles sont rejetées : pas de double comptage. Un horodatage sans décalage est lu dans le fuseau du foyer ; une ligne horaire commence à une heure pile. `category:<slug>` exige un poste existant ; `tariff_slot` n'existe que pour `grid_import` quotidien.
- Envoi par `POST /api/csv-import` (session), corps lu en flux, réponse NDJSON (progression par lot, puis rapport) ; rapport téléchargeable (ligne, contenu, motif ; 1 000 détails au plus, compteurs complets).

---

### 7.8 Synchronisation du calendrier Tempo
Le serveur interroge des API Tempo publiques. **Aucune donnée utilisateur n'est envoyée** : l'appel porte uniquement sur des dates.

| Ordre | Source | Auth | Usage |
|---|---|---|---|
| 1 | **api-couleur-tempo.fr** (communautaire) | aucune | **source V1** (instance SaaS et auto-hébergée) |
| 2 | `data/tempo-seed.json` | — | amorçage de l'historique (5 saisons complètes depuis septembre 2021, 43 jours blancs et 22 rouges chacune) et repli hors ligne ; ne remplace jamais une couleur récupérée en ligne |
| — | API officielle RTE (OAuth2) | `RTE_CLIENT_ID` / `RTE_CLIENT_SECRET` | **hors V1** : l'interface `TempoSource` permet de l'ajouter sans toucher au reste |

- **Quand** : le planificateur intégré au serveur (le même que la météo, §7.9) lance la synchronisation tous les jours à 11:30 et 17:00 (la couleur J+1 est publiée vers 11 h). `pnpm tempo:sync` fait la même chose à la main. Au démarrage, une passe de rattrapage complète les trous depuis la dernière date connue.
- **Robustesse** : timeout de 10 s, 3 essais avec backoff (client HTTP partagé avec Open-Meteo, `src/server/http.ts`). Une saison en échec n'arrête pas les suivantes et n'est jamais bloquante ; le compteur « N jours supposés » couvre les trous.
- **Isolation** : tout l'accès réseau passe par `src/server/tempo/` derrière une interface `TempoSource` ; le domaine reste pur.
- Variable d'env `TEMPO_SYNC=off` pour les instances qui refusent tout appel sortant.

### 7.9 Météo (Open-Meteo)
La météo ne passe plus par Home Assistant : le serveur la récupère auprès d'**Open-Meteo** (gratuit pour un usage non commercial ou open source, sans clé). Les données de la veille suffisent : aucune donnée en temps réel n'est nécessaire.

| Variable quotidienne Open-Meteo | Stockage | Usage |
|---|---|---|
| `temperature_2m_min` / `_max` / `_mean` | `t_min`, `t_max`, `t_mean` (°C) | DJU, corrélation avec le chauffage, scénario de la prévision |
| `sunshine_duration` | `sunshine_s` (secondes, affichées en heures) | production solaire mise en regard de l'ensoleillement |
| `shortwave_radiation_sum` | `radiation_mj_m2` (MJ/m², affiché en kWh/m² = ÷ 3,6) | rendement solaire normalisé : kWh produits ÷ kWh/m² reçus |

- **Localisation du foyer** : l'utilisateur cherche sa commune (API de géocodage Open-Meteo, sans clé) dans l'onboarding ou dans Réglages. On stocke le libellé et les coordonnées **arrondies à 0,01°** (environ 1 km).
- **Vie privée** : seules ces coordonnées arrondies sont envoyées, sans aucun identifiant. Les foyers d'une même maille partagent les mêmes lignes, donc une seule requête par maille et par jour.
- **Quand** : un planificateur intégré au serveur (`src/server/scheduler.ts`, instance unique en V1, rien à configurer dans Coolify ni en auto-hébergement) lance la synchronisation au démarrage puis chaque jour à partir de 07:00 (Paris). Elle demande l'API *forecast* avec `past_days=7` et `timezone=Europe/Paris`, et met à jour les **jours terminés** (la journée en cours, simple prévision, n'est pas stockée). `pnpm weather:sync` fait la même chose à la main, et `pnpm weather:sync --backfill <lat> <lon>` remplit l'historique d'une maille.
- **Historique** : à l'enregistrement de la localisation, l'API *archive* (réanalyse ERA5, à jour jusqu'à la veille en pratique) remplit 3 ans en arrière en une requête (environ 1 100 jours). Une valeur d'archive n'est jamais remplacée par une valeur de prévision. La prévision et les DJU fonctionnent ainsi dès le premier jour, sans attendre un hiver d'historique HA.
- **Robustesse** : timeout de 10 s, 3 essais avec backoff ; un échec n'est jamais bloquant, la journée manquante est reprise au passage suivant. `WEATHER_SYNC=off` désactive tout appel sortant.
- **Isolation** : l'accès réseau passe par `src/server/weather/`, derrière une interface `WeatherSource` ; les calculs (DJU, rendement) restent dans `src/domain`.
- **Sans localisation** : les cartes météo affichent un état vide « Indiquez votre commune » avec un lien vers Réglages ; la prévision retombe sur la saisie manuelle des DJU.

### 7.10 Repères
- Un **repère** est une note datée posée sur la frise du temps pour expliquer une hausse ou une baisse de consommation : type (Équipement, Maintenance, Absence, Autre), texte court, date, et date de fin facultative pour une durée (« maintenance du 3 au 10 »).
- **Repères automatiques**, déduits des données et non modifiables : début de chaque contrat souscrit (« Nouveau contrat : … ») et mise en service des équipements de Rentabilité.
- Affichage sur la **Vue d'ensemble** : une ligne discrète sous le sélecteur de période (« 2 repères · … », dépliable pour lire, modifier ou supprimer ; rien s'il n'y en a pas), le bouton « + Repère » à côté (date préremplie : aujourd'hui si la période le contient, sinon son premier jour), et un **point sous le mois** concerné dans l'histogramme du coût mensuel (texte dans l'info-bulle ; toucher le mois l'ouvre avec ses repères). Un repère sur plusieurs mois marque chacun d'eux.

### 7.11 Onglet Données (Réglages)
Section technique pour contrôler et corriger les valeurs enregistrées, sans parcourir des centaines de milliers de lignes :
- **Valeurs suspectes** : valeurs au-delà du seuil de plausibilité de leur compteur (§6, × 24 pour un jour), les plus récentes d'abord (100 au plus), à corriger ou supprimer en place.
- **Un jour, un compteur** : les valeurs d'un jour local (24 heures, ou le total du jour et ses créneaux), corrigibles une à une ; suppression de toute la journée. Compteur et jour dans l'URL (`?onglet=donnees&compteur=…&jour=…`, par défaut l'import réseau, la veille).
- **Supprimer une plage** : un compteur (ou tous), du … au … inclus ; aperçu (nombre de valeurs et kWh) puis suppression confirmée. La plage peut ensuite être réimportée (historique HA §6.4, ou CSV).
- Une valeur corrigée passe en source **`manual`** : ni un envoi de Home Assistant (horaire ou quotidien), ni l'import CSV, ni l'historique ne la remplacent. Une correction au-delà du seuil de plausibilité est refusée.

## 8. Blueprint Home Assistant (livré en V1)

`homeassistant/blueprints/wattsup_push.yaml` :
- Entrées (sélecteurs `entity`, jamais d'entités codées en dur) : import et export réseau (et HP/HC en mode quotidien), production solaire, charge et décharge batterie, couleur Tempo (optionnelle), liste de catégories (paires slug → entité), granularité.
- Déclencheur : `time_pattern` toutes les heures (minute 0), ou `time` à 00:05 en mode quotidien.
- Action : `rest_command.wattsup_push`. L'URL et le token vivent dans `secrets.yaml` (README pas à pas).
- Les capteurs `unavailable` ou `unknown` sont omis du payload au lieu d'envoyer 0.
- Les unités Wh, kWh et MWh sont converties en kWh d'après `unit_of_measurement`.
- Un envoi accepté sans aucune donnée d'énergie (`no_energy_data`) déclenche, comme un refus, une notification persistante dans HA.
- Aucune entrée météo : la météo vient d'Open-Meteo (§7.9). Les entrées température ont été retirées du blueprint et de l'automatisation d'Alexandre le 2026-10-03.
- Retours du branchement réel (2026-10-03) : en horaire, il faut des **index cumulés temps réel**. Les index Linky issus de l'API Enedis ne changent qu'une fois par jour ; les compteurs « du jour » ou « du mois » repartent à zéro. Le mode quotidien n'accepte que des `utility_meter`, qui exposent l'attribut `last_period`.

---

## 9. Écrans : adaptation de la maquette

Ce qui est ajouté ou modifié par rapport au prototype pour couvrir la spec :

| Écran | Ajouts / changements |
|---|---|
| **Compte** | Le bloc nom et foyer en bas de la barre latérale (sur mobile, l'initiale à droite de l'en-tête) ouvre un **menu du profil** : « Mon compte », « Boîte à idées », « Contact » (si l'envoi d'emails est configuré), un trait, « Se déconnecter ». Numéro de version de l'appli (`package.json`, numéro seul, très petit et centré) sous ce bloc, et en pied du menu sur mobile ; augmenté à chaque livraison (mineure si nouvelle fonction, correctif sinon). Page **Mon compte** (`/compte`) : carte **« Apparence »** : thème Clair (défaut) / Sombre / Automatique (suit l'appareil), appliqué aussitôt, enregistré sur le compte (`user.theme`) et posé par le serveur sur `<html data-theme>` (aucun flash au chargement ; couleur de la barre du navigateur assortie) ; identifiants (prénom et nom modifiables, 60 caractères au plus, contrôlés aussi à l'inscription ; adresse email modifiable, saisie deux fois, appliquée directement puisque l'instance n'envoie pas d'email ; mot de passe), relance du parcours de bienvenue, carte **« Mes données »** (T46 : « Énergie » en CSV au format de l'import, donc réimportable, généré en flux par lots de 10 000 valeurs, `GET /api/export/energie` ; « Tout le reste » en JSON : compte, foyer et réglages, postes, contrats et grilles, combustibles, équipements, repères, corrections Tempo, journal des envois, idées proposées, `GET /api/export/donnees` ; session exigée, jamais de token, de hash ni de mot de passe), suppression du compte et de toutes ses données dans une carte rouge. |
| **Administration** (administrateur seulement) | Dans la barre latérale (desktop seulement), sous la navigation, intitulé « Administration » et entrée **« Utilisateurs »** en couleur solaire sur un cadre pointillé, invisibles des autres comptes. Page `/admin/utilisateurs` (les autres comptes sont renvoyés vers l'accueil ; chaque opération serveur vérifie `is_admin`) : tableau des comptes, du plus récent au plus ancien : nom et email, date d'inscription, profils activés, nombre de postes, nombre de valeurs d'énergie enregistrées, dernier envoi Home Assistant (pastille et délai comme le statut du menu, date exacte au survol, « aucun sur 30 j » au-delà de la durée du journal), statut (Actif, Désactivé depuis le…, Administrateur). Actions « Désactiver » / « Réactiver » et suppression (confirmée sur la ligne, compte et données en cascade) ; jamais sur un compte administrateur ni sur le sien. Carte **« Inscriptions »** sous le tableau : Ouvertes / Sur invitation (codes d'invitation, séparés par des virgules) / Fermées, effet immédiat ; enregistrée, elle remplace `SIGNUP_MODE` et `INVITE_CODES`, qui ne servent plus que de valeur de départ. |
| **Boîte à idées** (`/idees`, tous les comptes) | Carte « Proposer une idée » : titre (60 caractères, exigé) et description (1 000, facultative), compteurs de caractères ; 5 idées par heure et par compte. Liste commune à l'instance : bouton de vote (un par compte, second clic pour le retirer, mis à jour sans attendre), titre, statut (Proposée, Planifiée, En cours, Terminée · vX.Y.Z), description, date ; tri par votes puis de la plus récente à la plus ancienne (figé pendant un vote) ; recherche dans le titre et la description (sans accents ni casse) et filtre par statut avec le nombre d'idées. L'auteur n'est montré qu'à l'administrateur. **Administrateur** : sur chaque idée, bandeau « Administrateur » en pointillés couleur solaire : statut (liste déroulante ; « Terminée » exige la version qui la livre, version courante proposée), suppression confirmée. Chaque nouvelle idée est envoyée par email à l'administrateur (si l'envoi d'emails est configuré ; un échec n'empêche pas l'enregistrement). En bas de page, bouton de soutien **Buy Me a Coffee** (reproduit en CSS, aucune ressource chargée chez un tiers). |
| **Contact** (`/contact`, si l'envoi d'emails est configuré ; sinon un encart le dit) | Carte « Écrire à l'administrateur » : expéditeur rappelé (nom et adresse du compte, rien à saisir), motif « Prendre contact » ou « Signaler un bug » (liste déroulante), message (2 000 caractères, compteur). Envoi par email à chaque administrateur : objet « [Contact] » ou « [Bug] » suivi du début du message, nom, adresse et version de l'appli dans le corps, réponse directe à l'expéditeur (`reply_to`) ; 5 messages par heure et par compte. Bouton de soutien Buy Me a Coffee en bas de page. |
| **Navigation** (transverse) | Un tap sur une entrée de menu (barre latérale, barre d'onglets, menu de Réglages) la rend active aussitôt ; son pictogramme pulse (ou un petit cercle tourne) tant que la page charge, et le contenu montre un squelette de cartes (`loading.tsx`) : menu et en-tête restent en place. |
| **Appli installable** | Manifeste web (`/manifest.webmanifest` : nom, icônes 192/512 « any » et « maskable », toutes bord à bord (carré jaune sans transparence, logo dans la zone sûre de 80 %) pour remplir l'icône du lanceur sans marge blanche, `display: standalone`, couleurs du fond de page) et balises iOS (icône d'écran d'accueil, plein écran) : « Ajouter à l'écran d'accueil » ou « Installer l'appli » ouvre WattsUp comme une appli. Pas de mode hors ligne. |
| **Auth & onboarding** (nouveau) | Connexion et inscription. **Mot de passe oublié** (si l'envoi d'emails est configuré : `RESEND_API_KEY`, `MAIL_FROM`, API Resend) : lien « Mot de passe oublié ? » sur la connexion → `/mot-de-passe-oublie` (même réponse que l'adresse existe ou non, 3 demandes par minute) → email avec un lien valable une heure, à usage unique → `/nouveau-mot-de-passe` (saisi deux fois) ; les sessions ouvertes sont fermées. Sans configuration, le lien n'apparaît pas. Assistant en 5 étapes : profil énergétique → **commune** (recherche, pour la météo) → contrat actuel (Base / HP/HC / Tempo, prix, plages HC) → connexion HA (token + téléchargement du blueprint + test « en attente du 1er push ») → import CSV facultatif. Route `/bienvenue?etape=N` : affichée tant que le parcours n'est ni terminé ni passé (`household.onboarding_done`, étape atteinte `onboarding_step` pour reprendre), « Passer l'accueil » à chaque étape, relance depuis la page Compte ; les foyers existants à la mise en service sont considérés comme configurés. Blueprints servis sur `/api/blueprint/<fichier>.yaml` (`source_url` réécrit sur l'adresse de l'instance qui les sert, pour que HA propose les mises à jour depuis WattsUp ; le fichier du dépôt garde l'adresse GitHub). Blueprint d'envoi sur `/api/blueprint/wattsup_push.yaml` : bouton « Importer dans Home Assistant » (my.home-assistant.io) et téléchargement ; attente du premier envoi interrogée toutes les 5 s. Chaque étape réutilise la carte de Réglages ou de Contrats correspondante. |
| **États vides** (nouveau, transverse) | Chaque carte gère « aucune donnée » (CTA connecter HA ou importer). Un badge de couverture (% d'heures ou de jours reçus) apparaît sur les calculs. |
| **Vue d'ensemble** | Mois et années issus des données réelles, plus de listes figées. Sélecteur période mois / année avec navigation ‹ ›. En mode quotidien, la carte « Origine de la consommation » passe au jour (pas d'intrajournalier). Si le solaire est actif, carte **« Production et ensoleillement »** pour la période choisie (par jour en vue mois, par mois en vue année) : barres de production et **courbe d'ensoleillement superposée** (choix de l'utilisateur : chacune sur sa propre échelle, valeur du haut indiquée de chaque côté : kWh à gauche, heures à droite ; valeurs dans l'info-bulle ; interrupteur « Comparer à N-1 » : production du même jour ou mois un an plus tôt en barre claire, la courbe s'efface pendant la comparaison), avec le rendement de la période (kWh produits par kWh/m² reçu) comparé à la même période de l'année précédente. Budget : coût réel de l'électricité (contrat et grille en vigueur chaque jour, abonnement compris) ; histogramme mensuel en **€** (abonnement toujours en bas de la barre) ou en **kWh** soutirés (sélecteur mémorisé sur l'appareil, prix moyen du kWh hors abonnement), avec en option le **même mois de l'année précédente** en barre claire à côté (mois entier, chiffré avec le contrat de l'époque ; écart affiché seulement pour une période terminée) ; les combustibles s'y ajoutent avec T23. En tête de page, carte **« À surveiller »** (seulement s'il y a une alerte ; 3 d'emblée, les plus graves d'abord, « Voir les autres » ensuite ; lien « Régler les alertes ») : une ligne par alerte, titre et explication, action en un clic et « Masquer ». Alertes, pour les modules du profil seulement : **stock de combustible bas** (stock ÷ consommation moyenne des 21 derniers jours sous N semaines, défaut 3 ; niveau 2 sous 7 jours) ; **Home Assistant silencieux** (aucun envoi accepté depuis N h, défaut 6, 26 h au moins en envoi quotidien ; niveau 2 après 24 h, 72 h en quotidien ; pas d'alerte avant le premier envoi) ; **production solaire en baisse** (rendement de chacun des 3 derniers jours complets, irradiation d'au moins 1 kWh/m², N % sous la médiane des rendements mensuels des 12 mois complets précédents, défaut 15 ; niveau 2 à −30 % en moyenne) ; **dépense du mois en hausse** (à partir du 7, coût des jours écoulés N % au-dessus des mêmes jours un an plus tôt, défaut 15 ; niveau 2 au double). Une alerte masquée reste cachée 7 jours, sauf si elle passe au niveau supérieur ; quand sa cause disparaît, son masquage est effacé. Pastille orangée sur l'entrée de menu concernée (Chauffage, Rentabilité, Vue d'ensemble ; Home Assistant a déjà son statut). Réglages › **Alertes** : interrupteur et seuil de chaque alerte (bornes : 1–12 semaines, 2–72 h, 5–50 %, 5–100 %), et « Recevoir aussi par email » (décoché par défaut ; proposé seulement si l'instance envoie des emails). **Par email** : tâche horaire du planificateur (à HH:20, si `RESEND_API_KEY`, `MAIL_FROM` et `BETTER_AUTH_URL` sont renseignés), comptes actifs ayant coché au moins une alerte ; un seul email par passage regroupant les alertes nouvelles ou passées au niveau supérieur (objet : le titre de l'alerte, ou « N alertes »), liens vers l'instance et vers Réglages › Alertes pour arrêter ; une alerte qui dure n'est pas renvoyée, une alerte réglée efface sa trace (table `alert_notification`, canal `email`, aussi prévue pour le push de T49). Le masquage dans l'appli n'empêche pas l'email. Comparaison N-1 sur les mêmes jours (« vs même période » pour la période en cours), en euros et en pourcentage. Pour une période en cours de l'année en cours, ligne **« À ce rythme : ≈ X € sur AAAA »** sous le budget (abonnement compris) : mois terminés et jours écoulés au réel, mois restants estimés sur le même mois N-1 corrigé de la tendance de l'année (dépense des mois terminés ÷ mêmes mois N-1, qui intègre aussi l'écart de météo entre les deux années), moyenne des mois terminés pour un mois sans N-1 ; fourchette ±15 % de la part estimée sous 3 mois comparables ; total N-1 si ses 12 mois sont connus. Pas de correction par des degrés-jours « normaux » (il faudrait des normales climatiques, non stockées). Si le contrat en cours a des heures creuses (HP/HC ou Tempo), carte **« Heures pleines et heures creuses »** sous l'histogramme : part de l'électricité soutirée sur la période en HC et en HP (barre 100 %, kWh, coût et prix moyen de chaque créneau ; kWh sous un contrat sans heures creuses signalés à part). Postes de consommation : les postes de chauffage (au moins deux) sont additionnés sur une ligne « Chauffage » repliée par défaut, à déplier pour le détail. Origine de la consommation : réseau, solaire autoconsommé et batterie, avec consommation du foyer = import + production + décharge − export − charge. Carte **« Talon de consommation »** (envois horaires seulement) : puissance appelée en permanence, mesurée chaque nuit de minuit à 6 h (consommation du foyer de l'heure la plus basse de chaque nuit d'au moins 5 heures reçues, puis médiane sur la période, 7 nuits au moins), en W en grand, avec son équivalent en kWh et en € par an (prix moyen du kWh soutiré de l'année), l'écart à la même période un an plus tôt et les 12 derniers mois en barres. En bas de page, carte **« Détail mois par mois »**, repliée par défaut : pour chaque mois de l'année, électricité soutirée (HP et HC si le contrat en a), coût, production solaire et économie solaire **estimée** (autoconsommation au prix moyen du kWh du mois, plus la revente si activée ; le calcul exact reste celui de Rentabilité) ; écart à N-1 pour les mois terminés, chaque mois se déplie sur le même mois de l'année précédente, total de l'année en pied. Défilement horizontal sur mobile, colonne des mois fixe. Sans contrat, encart « Budget non chiffré » vers Contrats. Si un autre contrat enregistré (simulé ou de référence) aurait coûté au moins 30 € de moins par an que le contrat en cours sur la consommation réelle (comparaison de Contrats, 90 jours de données au moins), encart « « X » vous aurait coûté Y € de moins » sous le budget, vers Contrats. Un mois avec décharge de batterie sans charge (ou l'inverse), souvent un historique importé incomplet, est signalé ici et dans Rentabilité, avec un lien vers l'import CSV. |
| **Chauffage** | Barre d'actions rapides : **« + Sac versé »** (avec toast d'annulation de 10 s), « + ½ stère », « Achat », « Corriger le stock ». Le stepper de stock affiche le **stock calculé** et le modifier crée une correction. Journal des derniers événements (modifiables et supprimables). Ligne d'équivalence kWh et DJU de la saison (température Open-Meteo, avec la commune en légende). État « données insuffisantes » pour la prévision. Saison choisie par ‹ › (`?s=AAAA`, saison en cours par défaut) ; chiffres clés comparés à la saison précédente **sur la même durée** ; coût mensuel empilé (électricité, granulés, bois) et **degrés-jours alignés en dessous** (deux graphiques sur le même axe du temps plutôt qu'une courbe de température sur une seconde échelle ; température moyenne en chiffres et dans les info-bulles) ; ligne « chaleur consommée ≈ X kWh pour Y degrés-jours, soit Z kWh par degré-jour (N-1) ». Les cartes de saisie rapide sont en tête de page. |
| **Rentabilité** | Hiérarchie de lecture : jauge d'amortissement et **montant déjà économisé** en grand chiffre (« sur X € » dessous), puis économie mensuelle et date d'amortissement, frise, détail ; capacité et date d'installation dans la ligne de description de la carte (pas de tuiles coût / capacité). Bouton « Modifier » sur chaque carte → feuille équipement (libellé libre, capacité, date d'installation, coût). La ligne « dont revente surplus » n'apparaît que si la revente est activée. Mention « charge réseau incluse » si l'option est active. Sur la carte solaire, l'écart au rendement attendu (même ensoleillement) signale une baisse de production : panneaux sales, onduleur en défaut. Carte **« Et si… ? »** sous les équipements : une batterie (capacité utile, puissance, prix ; « de plus » si le foyer en a déjà une) et/ou des panneaux en plus (kWc, prix ; production proportionnelle à la réelle, donc puissance installée requise), rejoués heure par heure sur les 12 derniers mois de données horaires (30 jours au moins) : la batterie se charge du surplus envoyé au réseau et se décharge sur les achats, dans la limite de sa capacité et de sa puissance, rendement aller-retour de 90 %, vide au départ. Résultat : économie par an en grand (achats évités au prix du contrat actuel, créneau par créneau, moins la revente perdue si elle est activée ; ramenée à un an si les données sont plus courtes), amortissement (avec mise en garde au-delà de 15 ans pour une batterie), autoconsommation avant → après, kWh achetés et envoyés au réseau par an, hypothèses en pied. |
| **Contrats** | Le bouton « + Simuler un nouveau contrat » ouvre un **éditeur** par type (Base, HP/HC avec plages multiples, Tempo avec 6 prix, Custom avec règles jour et plage). Actions dupliquer, supprimer et « définir comme actuel ». Calendrier Tempo de la période avec indicateur de source et correction manuelle d'un jour. Bandeau « simulation approximative » en mode quotidien pour un contrat HP/HC dont les plages diffèrent du contrat actuel. Historique : contrat actuel en tête, contrats passés avec leurs dates (frise), offres simulées ensuite. Actions « Nouveaux prix à partir du… » (nouvelle période de grille), « J'ai changé de contrat le… » (clôt l'actuel la veille, ouvre le nouveau) et historique des grilles de chaque contrat. Une carte par contrat : contrat en cours encadré et badgé « En cours », prix du jour en tuiles lisibles (HP, HC, abonnement en €/mois et €/an ; tableau 3 × 2 pour Tempo), frise de 24 h des heures creuses, nouveaux prix à venir signalés. La fin d'un contrat se saisit par « Toujours en cours » décoché puis « Résilié le » ; si aucun contrat n'est en cours alors que le dernier s'est terminé, un encart propose « C'est toujours mon contrat » (retire la date de fin). |
| **Réglages** | Sections : Profil énergétique · **Localisation** (recherche de commune, coordonnées arrondies affichées, état de la dernière synchro météo) · **Ingestion** (granularité horaire / quotidienne, token avec régénérer et révoquer, journal des 20 derniers pushes, téléchargement du blueprint) · **Solaire & batterie** (revente + prix, charge depuis le réseau) · **Combustibles** (poids du sac, sacs par palette, saison de chauffe, facteurs kWh) · Postes de consommation (icône, couleur, case « chauffage », slug affiché pour HA) · Import CSV (aperçu + rapport d'erreurs) · Compte (mot de passe, suppression du compte et des données). **Sections** (`?onglet=…`), un ou deux encarts chacune, regroupées : *Mon foyer* (Profil · Localisation · Équipements, absent si le profil n'a ni solaire, ni batterie, ni combustible · Postes), *Home Assistant et données* (Home Assistant · Historique · Données), *Suivi* (Alertes). Ordinateur : menu vertical à gauche (pictogramme et nom, groupes titrés, collé en haut au défilement), contenu à droite, Profil par défaut. Téléphone : sans section choisie, liste des sections (pictogramme, nom, une ligne d'explication, chevron) ; dans une section, lien « ‹ Réglages », nom de la section en titre, retour en haut de page. Le titre, le menu et l'en-tête de section sont dans la mise en page : ils restent en place pendant qu'une section charge. Les liens des autres écrans visent l'onglet utile (`settingsHref`). |

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
| Intégration (météo) | Vitest + MSW | `WeatherSource` : parsing *forecast* et *archive*, conversions (s → h, MJ/m² → kWh/m²), mutualisation par maille, reprise après échec, `WEATHER_SYNC=off` = zéro appel réseau ; domaine : DJU et rendement solaire | aucun appel réseau réel en CI |
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
- Appeler des API tierces en V1 (fournisseurs…), **sauf** les sources Tempo (§7.8) et Open-Meteo (§7.9), et jamais avec une donnée utilisateur. Seule exception : les coordonnées arrondies à 0,01°, envoyées sans identifiant.
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
Pull HA, API des fournisseurs, appli native, foyers multi-membres, alertes de stock (phase 4), vues comparatives annuelles avancées (phase 4).

---

## 15. Décisions issues de la revue (2026-10-02)

| Sujet | Décision |
|---|---|
| Batterie | Générique, sans marque imposée. Charge depuis le réseau en option (désactivée par défaut) ; métrique `battery_charge_grid` utilisée seulement si l'option est active. |
| Revente surplus | Optionnelle, désactivée par défaut ; prix €/kWh saisi par l'utilisateur. |
| Contrats datés (2026-10-03) | Contrats **souscrits** datés (début, fin) et **simulés** ; **historique de prix par contrat** (grilles datées). Le coût de l'historique utilise le contrat et la grille en vigueur à chaque date ; la comparaison utilise la grille actuelle de chaque offre. |
| Couleurs Tempo | Récupération automatique côté serveur (api-couleur-tempo.fr, sinon seed ; RTE officielle reportée après la V1), calendrier global partagé ; capteur HA et correction manuelle prioritaires par foyer. Exception assumée au « pas d'API tierce » du PRD. |
| Licence | **GPL-3.0-or-later**. NB : la GPL n'oblige pas un tiers qui opère un fork en SaaS à publier ses modifications (seule l'AGPL le fait). |
| Maquette | Référence de **principe** (identité visuelle, ton, structure). Les écrans sont adaptés aux fonctionnalités et décisions de cette spec (§9). |
| Granulés et bois | Saisie manuelle prioritaire (« + Sac versé », « Achat », « Corriger le stock ») ; compteur HA optionnel ; poids du sac paramétrable (15 kg par défaut). |
| Hébergement | Projet Coolify « WattsUp Energy » sur le VPS, application Dockerfile, domaine **`wattsup-energy.kraftpunk.app`** ; base `wattsup` sur la ressource partagée `postgres-partage` (une base par appli), sauvegardée chaque nuit et vérifiée par `check-backups`. Sert d'instance de recette dès le jalon 1, puis de prod. |
| Inscription SaaS | Réglage de l'administrateur (page Utilisateurs, table `instance_settings`), sinon variable d'env `SIGNUP_MODE=open\|invite\|closed` (défaut `open` en auto-hébergé ; valeur inconnue = fermé). En `invite`, un des codes d'invitation (réglage ou `INVITE_CODES`, liste séparée par des virgules) est exigé, envoyé dans l'en-tête `x-invite-code` et vérifié par un crochet Better Auth sur `/sign-up/email`, y compris pour un appel direct à l'API. `/inscription` affiche « Inscriptions fermées » en `closed`, et le lien « Créer un compte » disparaît de la connexion. |
| Météo (2026-10-03) | Récupérée côté serveur auprès d'**Open-Meteo** (température min/max/moyenne, durée d'ensoleillement, irradiation) pour la commune du foyer, données de la veille ; HA ne fournit plus la météo. Exception assumée au « pas d'API météo » du PRD, au même titre que Tempo. |
| Fiche équipement | Feuille « Modifier l'équipement » ouverte depuis chaque carte ROI (libellé, capacité, date d'installation, coût). |

## 16. Questions ouvertes

Aucune question bloquante.
