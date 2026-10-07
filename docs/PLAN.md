# Plan d'implémentation : WattsUp Energy V1

> Statut : **validé** (phase 2 « Plan »). Détail des tâches : [TASKS.md](./TASKS.md)
> Source : [SPEC.md](./SPEC.md). Le détail des tâches (fichiers, commandes de vérification) sera produit en phase 3.
> Dernière mise à jour : 2026-10-03

## Vue d'ensemble

Une application Next.js monolithique (UI + API d'ingestion), sur PostgreSQL. Toute la logique de calcul (deltas d'index, tarifs, Tempo, DJU, prévision, ROI) vit dans `src/domain`, sous forme de fonctions pures testées en TDD.

La construction avance par **tranches verticales**. Chaque jalon livre un parcours utilisable de bout en bout. La priorité : **faire arriver tôt les vraies données Home Assistant sur une instance de staging Coolify**, pour que l'historique réel s'accumule pendant qu'on construit le reste.

## Décisions d'architecture

| Décision | Raison |
|---|---|
| Monolithe Next.js : web, Route Handler d'ingestion, Server Actions | un seul conteneur sur Coolify, pas d'API interne à maintenir |
| `src/domain` pur, sans I/O | moteur tarifaire et prévision testables à 0,01 € près, indépendants de la DB |
| Agrégats calculés **à la lecture** en SQL (`date_trunc` dans le fuseau du foyer) | ~61 k lignes/foyer/an : pas besoin de vues matérialisées en V1. Point de bascule documenté si p95 > 300 ms |
| Calcul de coût en TS (et non en SQL) | les règles Tempo et Custom sont trop riches pour du SQL ; le volume d'un an horaire (8 760 intervalles) reste trivial en mémoire |
| Montants en centimes entiers, arrondis à l'affichage seulement | évite les dérives d'arrondi sur 12 mois |
| Calendrier Tempo global, avec surcharge par foyer | donnée publique : une synchro sert tous les foyers |
| Météo Open-Meteo par maille de 0,01°, côté serveur (2026-10-03) | ajoute l'ensoleillement et l'irradiation que HA ne fournit pas, donne un historique immédiat (archive ERA5) et mutualise les appels ; HA ne pousse plus la météo |
| Rate limiter en mémoire derrière une interface | instance unique en V1, remplaçable par Redis ou PG plus tard |
| Déploiement de staging dès le jalon 1 | les vraies données s'accumulent tôt et les risques Docker/Coolify sont levés tôt |
| Seed synthétique de 2 ans dès le jalon 2 | permet de développer les écrans sans attendre un an de données réelles |

## Graphe de dépendances

```
T1 Socle repo ──► T2 DB + Auth ──► T3 Contexte foyer / isolation
                                         │
                       ┌─────────────────┼──────────────────────┐
                       ▼                 ▼                      ▼
               T4 Shell UI +       T5 Tokens ingestion    T12–T14 Moteur tarifaire (pur)
               visibleModules            │                      │
                       │        T6–T7 Normalisation (pur)       │
                       │                 ▼                      │
                       │        T8–T9 Route /ingest ──► T10 Blueprint HA
                       │                 │                      │
                       │                 ▼                      │
                       │        T11 Docker + staging Coolify    │
                       │                 │                      │
                       │                 ▼                      ▼
                       │        T15 Seed démo ───────► T16 Sync Tempo ──► T17 CRUD contrats ──► T18 Écran Contrats
                       │                                  └──► T16b Météo Open-Meteo ──► T20, T25, T29
                       │                 │
                       ├──► T19 Catégories ──► T20 Vue d'ensemble ──► T21 États vides / couverture
                       │                 │
                       │                 └──► T22 Import CSV
                       │
                       ├──► T23 Domaine combustibles ──► T24 Saisie rapide ──┐
                       │    T25 DJU + coût chauffe (pur) ───────────────────┼──► T26 Vue Chauffage ──► T27 Prévision
                       │
                       └──► T28 Équipements + réglages ──► T29 ROI (pur) ──► T30 Écran Rentabilité

T31 Onboarding, T32 Réglages restants, T33 E2E et perf, T34 Docs et release : en fin de parcours
```

## Liste des tâches

Taille : **S** = 1–2 fichiers · **M** = 3–5 fichiers. Aucune tâche L/XL.

### Jalon 0 : Socle

| # | Tâche | Taille | Dépend de | Critère d'acceptation clé |
|---|---|---|---|---|
| T1 | Initialiser le repo : `git init`, Next.js 15 en TS strict, pnpm, ESLint et Prettier, Vitest, Tailwind avec les tokens de la maquette, polices, `LICENSE` GPL-3.0 | M | — | `pnpm lint && pnpm test && pnpm build` passent |
| T2 | Postgres via docker compose, Drizzle, première migration (`household` + settings), Better Auth (inscription et connexion), création auto du foyer à l'inscription | M | T1 | US-1 : un compte créé donne un foyer en base, la session tient |
| T3 | `getHouseholdContext()` et harnais de test d'isolation multi-tenant réutilisable | S | T2 | le foyer A ne peut pas lire le foyer B, et le harnais s'applique à toute action serveur |
| T4 | Shell UI : sidebar sur desktop, onglets en bas sur mobile, `visibleModules()` pure et testée, 5 pages vides avec redirections, section « Profil énergétique » persistée | M | T3 | US-4 et US-5 sur les pages vides : la nav s'adapte au profil, `/rentabilite` redirige |

**Checkpoint A** : connexion, nav adaptative, isolation testée. Revue humaine de l'UI shell.

### Jalon 1 : Ingestion de bout en bout ⚠ risque élevé, traité tôt

| # | Tâche | Taille | Dépend de | Critère d'acceptation clé |
|---|---|---|---|---|
| T5 | Tokens d'ingestion : génération, hachage, préfixe visible, copier, régénérer, révoquer (Réglages › Ingestion) | S | T3 | le token n'est affiché qu'une fois, seul son hash est stocké |
| T6 | Domaine : normalisation horaire des index cumulés en intervalles (delta, reset, prorata < 24 h, trou > 24 h, changement d'heure) | S | T1 | tests TDD de tous les cas de la spec §6.1 |
| T7 | Schémas Zod v1 (horaire et quotidien) et normalisation quotidienne HP/HC | S | T1 | payloads valides et invalides des fixtures |
| T8 | Route `POST /api/v1/ingest` : `meter_state`, `energy_interval`, `weather_daily` (+ DJU), `tempo_override`, `ingest_log` | M | T5–T7 | codes 200, 400 et 401 testés en intégration ; idempotence quotidienne |
| T9 | Garde-fous : rate limit 120/min, 413, réglage de granularité et 409 en cas d'incohérence, « dernier push » affiché | S | T8 | codes 429, 413 et 409 testés ; l'indicateur HA de la nav est réel |
| T10 | Blueprint HA et `homeassistant/README.md` | S | T8 | sur ta vraie instance HA, un push horaire produit un 200 |
| T11 | Dockerfile multi-stage, `docker-compose.yml` complet, migrations au démarrage, déploiement sur Coolify (projet « wattsup », `wattsup-energy.kraftpunk.app`) | S | T8 | `docker compose up` fonctionne sur une machine vierge ; ton HA pousse vers l'instance Coolify |

**Checkpoint B** : **tes vraies données arrivent sur le staging chaque heure.** Revue du journal d'ingestion sur 24 h.

### Jalon 2 : Moteur tarifaire et contrats ⚠ risque élevé (exactitude)

*T12–T14 sont pures et peuvent démarrer dès T1, en parallèle du jalon 1.*

| # | Tâche | Taille | Dépend de | Critère d'acceptation clé |
|---|---|---|---|---|
| T12 | Tarifs Base et HP/HC (plages multiples), abonnement au prorata, ventilation mensuelle et par créneau, changement d'heure | M | T1 | fixture d'un an : écart ≤ 0,01 € avec le calcul manuel |
| T13 | Tarif Tempo : 6 prix, jour qui commence à 6 h, compteur de jours supposés | S | T12 | tests à la frontière 0–6 h et sur jours inconnus |
| T14 | Tarif Custom (règles jour + plage) : cas Zen Week-End | S | T12 | fixture Zen WE ≤ 0,01 € |
| T15 | Seed démo : 2 ans horaires synthétiques, cohérents (saisons, solaire, chauffe, combustibles) | S | T8 | `pnpm db:seed` remplit un foyer démo exploitable par tous les écrans |
| T16 | Synchro Tempo : `tempo_calendar`, `TempoSource` (communautaire → seed), `pnpm tempo:sync`, tâche planifiée Coolify, `TEMPO_SYNC=off` | M | T2 | tests MSW de bascule ; sur le staging, l'historique de 2 ans est rempli |
| T16b | Météo Open-Meteo : localisation du foyer (recherche de commune), `weather_daily` par maille, `WeatherSource` (*forecast* + *archive*), `pnpm weather:sync`, bloc `weather` retiré de l'ingestion | M | T2, T16 | tests MSW ; sur le staging, 3 ans d'historique pour ta commune et la veille mise à jour chaque matin |
| T17 | CRUD contrats : éditeur par type, « définir comme actuel », dupliquer, supprimer | M | T12–T14 | US-6 (création) : chaque type est créable et validé par Zod |
| T18 | Écran Contrats : comparaison sur 12 mois, encart du meilleur contrat, couverture, bandeau « approximatif » en mode quotidien, calendrier Tempo corrigeable | M | T16, T17 | US-6 : sur le seed, le classement est correct et les écarts affichés justes |
| T18b | Contrats datés (souscrits / simulés) et historique de prix par contrat ; coût réel de l'historique valorisé au contrat et à la grille du jour | M | T17, T18 | migration sans perte ; changer de contrat et ajouter une grille fonctionnent ; « Réellement payé » affiché |

**Checkpoint C** : critère de réussite n° 3 atteint (4 contrats de référence à 0,01 € près). Tempo simulé sur tes données HP/HC réelles du staging.

### Jalon 3 : Vue d'ensemble, postes et historique

| # | Tâche | Taille | Dépend de | Critère d'acceptation clé |
|---|---|---|---|---|
| T19 | Postes de consommation : CRUD avec icône, couleur, case « chauffage », slug affiché pour HA | S | T4 | US-10 ; une clé inconnue dans le payload produit un avertissement |
| T20 | Vue d'ensemble : budget mois/année avec navigation, coût par source, origine de la conso, postes, production et ensoleillement ; requêtes agrégées | M | T12, T15, T16b, T19 | sur le seed, les totaux de la vue égalent ceux du moteur |
| T21 | États vides et badge de couverture (composant transverse) | S | T20 | un foyer neuf ne voit aucune carte cassée ni de NaN |
| T22 | Import CSV : parsing en flux, validation par ligne, upsert par lots, rapport, UI d'aperçu | M | T8 | US-9 ; 8 760 lignes en < 10 s ; HA écrase le CSV |

**Checkpoint D** : le parcours « je connecte HA + j'importe 2024 → je vois mon budget » fonctionne sur le staging.

### Jalon 4 : Chauffage et prévision

| # | Tâche | Taille | Dépend de | Critère d'acceptation clé |
|---|---|---|---|---|
| T23 | Domaine combustibles : stock courant, consommation par saison, prix moyen pondéré | S | T1 | TDD : snapshot + achats − consommations |
| T24 | Saisie rapide : « + Sac versé » avec annulation 10 s, « + ½ stère », Achat, Corriger le stock, journal modifiable | M | T23, T4 | ajouter un sac versé prend 1 tap sur mobile ; le stock se met à jour |
| T25 | Domaine : DJU de saison (température Open-Meteo), équivalences kWh, coût de chauffe (élec chauffage + combustibles) | S | T12, T16b, T23 | tests des facteurs (4,8 kWh/kg, 15 kg, 1 800 kWh/stère) |
| T26 | Vue Chauffage : KPI, graphe coût + température, ligne d'équivalence kWh | M | T24, T25 | US-4 : aucune trace de bois si le bois est désactivé |
| T27 | Prévision de réapprovisionnement : domaine (conso par DJU, scénarios, arrondi palette ou demi-stère) + encart UI + état « données insuffisantes » | M | T25, T26 | US-7 / parcours PRD 2 reproduit sur le seed |

**Checkpoint E** : parcours PRD 1 et 2 validés manuellement sur mobile.

### Jalon 5 : Rentabilité

| # | Tâche | Taille | Dépend de | Critère d'acceptation clé |
|---|---|---|---|---|
| T28 | Équipements (feuille « Modifier ») et réglages solaire/batterie (revente + prix, charge depuis le réseau) | S | T4 | les champs sont persistés et validés |
| T29 | Domaine ROI solaire et batterie (autoconso, revente optionnelle, charge réseau, projection) et rendement solaire normalisé (kWh produits ÷ kWh/m²) | S | T12, T16b, T28 | TDD sur 4 combinaisons revente × charge réseau |
| T30 | Écran Rentabilité : jauges, frise d'amortissement, lignes conditionnelles | M | T29 | US-8 / parcours PRD 3 |

**Checkpoint F** : toutes les fonctionnalités V1 sont présentes sur le staging.

### Jalon 6 : Onboarding, finitions, release

| # | Tâche | Taille | Dépend de | Critère d'acceptation clé |
|---|---|---|---|---|
| T31 | Onboarding en 5 étapes (profil → commune → contrat → HA avec attente du 1er push → CSV facultatif) | M | T9, T16b, T17, T22 | un compte neuf atteint un dashboard alimenté sans lire de doc |
| T32 | Réglages restants : combustibles, journal des 20 derniers pushes, compte (mot de passe, suppression du compte et des données), `SIGNUP_MODE` | M | T9 | la suppression du compte efface toutes les lignes du foyer (test) |
| T33 | E2E Playwright (parcours PRD 1–3, onboarding, 5 profils × 2 viewports), test de charge sur l'ingestion, Lighthouse | M | T31 | critères de réussite n° 4, 5 et 7 |
| T34 | Docs open source (README, `docs/api.md`, `docs/csv-format.md`, CONTRIBUTING), image publiée, déploiement de prod | S | T33 | une install depuis le README seul fonctionne |

**Checkpoint final** : les 8 critères de réussite de la spec (§13) sont vérifiés. Revue finale.

### Jalon 7 : Compte, administration et retours des utilisateurs (ajouté le 2026-10-07)

| # | Tâche | Taille | Dépend de | Critère d'acceptation clé |
|---|---|---|---|---|
| T35 | Prénom et nom modifiables (Mon compte), version de l'appli en bas du menu | S | T32 | le menu affiche le nouveau nom sans reconnexion |
| T36 | Compte administrateur (`user.is_admin`, fixé par migration) et page Utilisateurs (désactiver, supprimer) | M | T35 | un non-administrateur ne lit ni ne modifie rien (test) ; un compte désactivé ne se connecte plus et ses envois HA sont refusés |
| T39 | Mode d'inscription (ouvert, sur invitation avec codes, fermé) réglé par l'administrateur sur la page Utilisateurs ; repli sur `SIGNUP_MODE` / `INVITE_CODES` | S | T36 | le réglage prime sur la variable d'environnement (test) |
| T37 | Boîte à idées : proposition, votes, filtre, recherche ; statut et suppression par l'administrateur ; email à chaque nouvelle idée | M | T36 | un vote par compte ; seul l'administrateur change un statut (test) |
| T38 | Contact (prendre contact, signaler un bug) par email à l'administrateur | S | T36 | réponse directe à l'expéditeur (`reply_to`) |

### Jalon 8 : Comprendre et anticiper (validé le 2026-10-07)

| # | Tâche | Taille | Dépend de | Critère d'acceptation clé |
|---|---|---|---|---|
| T40 | Admin : dernier envoi HA par compte | XS | T36 | envois d'historique et de combustible exclus |
| T41 | Talon de consommation (W, kWh/an, €/an, évolution) | S | T20 | TDD sur un profil horaire connu |
| T42 | Projection de fin d'année (corrigée des degrés-jours) | S | T20, T16b | TDD ; fourchette sous 3 mois de données |
| T43 | Thème sombre (Clair par défaut / Sombre / Automatique, sur le compte) | M | T35 | aucun flash au chargement ; contraste AA |
| T44 | Alertes dans l'appli (stock, HA muet, solaire, budget), Réglages › Alertes | M | T27, T29, T20 | une alerte masquée revient si elle s'aggrave |
| T45 | Simulateur « Et si… » batterie / panneaux ; contrat moins cher | L | T29 | bilan énergétique conservé heure par heure |
| T46 | Export de mes données (CSV réimportable + JSON) | S | T22 | aller-retour export → import identique |
| T47 | `GET /api/v1/summary` pour Home Assistant | M | T20, T27 | 401 pour un token révoqué ou un compte désactivé |
| T48 | Heures conseillées (surplus, HC, Tempo de demain) | M | T20, T15 | seulement ce qui s'applique au foyer |
| T49 | Notifications push (service worker, VAPID, `web-push`) | M | T44 | une alerte n'est poussée qu'une fois |
| T50 | Vue d'ensemble personnalisable : blocs masquables depuis la Vue d'ensemble ou Réglages › Vue d'ensemble | S | T41, T45, T48 | un bloc masqué laisse un message avec le lien pour le réafficher |

**Ensuite** : passe de sécurisation, puis T34 (GitHub : README, image, `v1.0.0`), puis wiki. Bilan mensuel par email et foyer partagé écartés pour l'instant.

## Parallélisation

| Peut avancer en parallèle | Doit rester séquentiel |
|---|---|
| T6, T7, T12–T14, T23, T25, T29 (domaine pur, dès T1) | T2 → T3 → toute action serveur |
| T19, T22 et T23–T24 après le checkpoint B | migrations DB : une seule branche à la fois les modifie |
| T34 (docs) au fil de l'eau | T8 (contrat d'ingestion figé) avant T10 et T22 |

## Risques et parades

| Risque | Impact | Parade |
|---|---|---|
| Les capteurs HA `total_increasing` font des resets ou des sauts (redémarrage HA, remplacement de compteur) | Élevé : données fausses | détection des resets (T6), plafond de delta plausible par métrique avec avertissement, test sur les vraies données dès le checkpoint B |
| Changement d'heure été/hiver (heures dupliquées ou manquantes) dans les intervalles et les plages HC | Élevé : coûts faux 2×/an | stockage en UTC, calculs dans le fuseau du foyer via une seule lib (`date-fns-tz`), cas dédiés dans T6 et T12 |
| Format ou disponibilité de l'API Tempo (service communautaire non garanti) | Moyen | repli sur le seed, interface `TempoSource` prête pour RTE ; tests MSW ; « jours supposés » visibles |
| Better Auth avec Next 15 et Drizzle (versions récentes) | Moyen | traité dès T2 (fail fast) ; repli possible sur Auth.js |
| Perf des agrégats si un foyer pousse plus fin que prévu | Faible | index `(household_id, start)` ; mesure au T33 ; vue matérialisée journalière si besoin |
| Disponibilité ou conditions d'Open-Meteo (gratuit en non commercial, environ 10 000 appels par jour) | Faible | une requête par maille et par jour, interface `WeatherSource` remplaçable (Météo-France, par exemple), journée manquante reprise au passage suivant |
| Cron Coolify pour `tempo:sync` | Faible | repli : passe de rattrapage au démarrage et à la consultation de Contrats |
| Exactitude des grilles tarifaires de référence (prix 2026) | Moyen | fixtures avec les prix saisis à la main, sourcés dans le fichier de fixture |
| Mode quotidien sans Tempo ni plages HC alternatives | Faible | limite documentée, bandeau UI (T18) |

## Décisions de revue (2026-10-02)

- Coolify : projet **« wattsup »**, domaine **`wattsup-energy.kraftpunk.app`**. Il sert d'instance de recette (appelée « staging » dans ce plan) dès T11, puis de prod.
- Tempo : **service communautaire seul** en V1, plus le seed ; RTE reporté.
- Contrats (2026-10-03) : contrats **datés** et **historique de prix par contrat** (T18b), prérequis de la Vue d'ensemble, du chauffage et de la rentabilité.
- Météo (2026-10-03) : **Open-Meteo** côté serveur à la place de HA, avec la durée d'ensoleillement et l'irradiation pour la production solaire ; nouvelle tâche T16b.
