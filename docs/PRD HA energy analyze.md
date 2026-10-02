# PRD.md : WattsUp Energy

## Overview
L'application « WattsUp Energy » est une plateforme SaaS Web open-source conçue pour la communauté Home Assistant. Elle permet aux utilisateurs de centraliser, d'analyser et d'optimiser leur consommation et production d'énergie globale (électricité du réseau, production solaire, décharge de batterie, chauffage aux granulés ou au bois). En croisant les données télémétriques (incluant la météo locale) poussées par Home Assistant avec des modèles de contrats énergétiques configurables, l'outil simule les coûts, calcule le retour sur investissement (ROI) des équipements (solaire, batterie) et propose un tableau de bord adaptatif du chauffage avec prévision des réapprovisionnements (sacs de granulés, stères de bois).

## Product Type
**Classification :** Web App + Service/API

L'application combine une interface web pour les utilisateurs finaux et une API publique pour la réception des données télémétriques.
*   **Vérifications appliquées (Web App) :** Authentification et sessions, autorisation par ressource (multi-tenant), modèle de données et migrations (PostgreSQL), design adaptatif, support navigateur.
*   **Vérifications appliquées (Service/API) :** Contrat d'API, authentification par token pour l'ingestion, limitation de débit (rate limiting), confidentialité des données.
*   **Vérifications ignorées :** 
    *   *Taille du binaire, comportement hors-ligne (Offline sync), OS permissions, app-store review* : Il s'agit d'une application web et non d'une application mobile native ; une connexion active est requise.
    *   *SEO pour les pages publiques* : Le produit est un outil utilitaire privé derrière un portail de connexion.

## Goals and Objectives
*   **Contrôle Budgétaire :** Fournir une vision claire du budget énergétique mensuel et annuel, toutes sources confondues.
*   **Optimisation Tarifaire :** Identifier mathématiquement le contrat d'électricité le plus économique (incluant les offres complexes comme Tempo) sur la base de la consommation réelle.
*   **Analyse de Rentabilité Matérielle (ROI) :** Mesurer précisément l'amortissement et les économies générées par l'infrastructure locale (panneaux solaires, micro-onduleurs, routeur solaire, cycles de la batterie) par rapport aux tarifs du réseau.
*   **Analyse et Prévision du Chauffage :** Offrir une vision consolidée du coût de chauffe et estimer avec précision les volumes de combustible (bois/pellets) à commander pour la saison suivante en fonction du stock restant et de l'historique.
*   **Interface Adaptative :** Personnaliser l'affichage en masquant automatiquement les widgets et sections non pertinents selon la configuration du foyer.
*   **Vie Privée et Sécurité :** Offrir une intégration avec Home Assistant basée sur le « push » de données sortantes, sans obliger l'utilisateur à exposer son instance locale sur internet.

## Scope
**Inclus dans la V1 (MVP) :**
*   Interface Web responsive (optimisée mobile/desktop) avec affichage conditionnel/dynamique des composants.
*   Architecture SaaS multi-tenant avec authentification utilisateur.
*   API d'ingestion de données (Push) gérant l'énergie, les sous-catégories, la météo locale et la batterie.
*   Module d'importation manuelle (CSV) pour l'historique des données passées.
*   Moteur de configuration de contrats électriques (Base, Heures Pleines/Heures Creuses, Tempo/Complexes).
*   Tableau de bord « Chauffage » adaptatif (électricité dédiée, bois, pellets) avec estimateur d'achat pour la saison suivante.
*   Calculateurs de rentabilité (Amortissement de l'installation solaire et ROI de la batterie).
*   Catégories de consommation 100 % sur mesure avec gestion d'icônes personnalisées.
*   Compatibilité de déploiement via Coolify avec base de données PostgreSQL.

**Exclus de la V1 :**
*   Récupération automatique (Pull) depuis Home Assistant (l'API de l'utilisateur n'est pas interrogée).
*   Connexion directe aux API des fournisseurs d'énergie ou API météo tierces.
*   Application mobile native (iOS/Android).

## User Personas or Target Audience
**Alex, le « Maker » et Product Owner Domotique**
*   **Profil :** Utilisateur avancé gérant une infrastructure locale poussée (micro-onduleurs Enphase, routeur solaire, batterie domestique de type Marstek) et un chauffage d'appoint au bois/granulés.
*   **Besoin :** Souhaite analyser son ROI global, anticiper ses commandes de pellets/bois pour l'automne à venir en fonction de ce qu'il lui reste en stock, et disposer d'une interface épurée sans menus inutiles s'il n'utilise pas un type d'énergie particulier.
*   **Contrainte :** Exige un contrôle total de ses données de consommation détaillées et refuse d'ouvrir des ports entrants sur sa box internet.

## Functional Requirements (FR)

| ID | Fonctionnalité | Description | Priorité |
| :--- | :--- | :--- | :--- |
| **FR-1** | Authentification et Isolation | Inscription, connexion et stricte séparation des données par foyer (multi-tenant). | Critique |
| **FR-2** | API d'Ingestion Globale | Endpoint sécurisé par token acceptant un payload JSON contenant : compteurs réseau, compteurs batterie, stock/conso granulés ou bois, et capteurs météo locaux. | Critique |
| **FR-3** | Configuration des Contrats | Interface de création et d'édition des contrats (actuel et simulés) incluant abonnements, taxes, et tarifications variables (HP/HC, Tempo). | Critique |
| **FR-4** | Moteur de Simulation Énergétique | Algorithme calculant les coûts réels et simulés en appliquant les grilles tarifaires aux données ingérées. | Critique |
| **FR-5** | Module d'Import Historique | Interface permettant de téléverser des fichiers CSV pour charger les historiques de consommation/production des années antérieures. | Haute |
| **FR-6** | Gestion des Sous-catégories | Système CRUD permettant de créer des postes de consommation sur mesure avec attribution d'icônes personnalisées. | Haute |
| **FR-7** | Personnalisation Dynamique de l'UI | Réglages du profil énergétique (combustibles utilisés : Bois, Pellets, Électrique, Aucun). Masquage automatique dans toute l'interface des blocs et métriques non sélectionnés. | Haute |
| **FR-8** | Analyse de Rentabilité Batterie | Calculateur déterminant l'économie financière réalisée grâce aux cycles de la batterie (valorisation de la décharge face au prix de l'heure pleine évitée). | Haute |
| **FR-9** | Analyse de Rentabilité Solaire | Module de calcul du ROI de l'installation photovoltaïque (coût d'installation initial vs. cumul des économies d'autoconsommation + revente éventuelle) avec projection de la date d'amortissement. | Haute |
| **FR-10** | Vue Unifiée « Chauffage » | Tableau de bord croisant la consommation électrique catégorisée « chauffage » et la consommation de bois/pellets pour donner un coût de chauffe global, mis en regard avec la température extérieure locale. | Haute |
| **FR-11** | Estimation de Réapprovisionnement | Module prédisant le volume de combustible à acheter (nombre de stères de bois ou palettes/sacs de granulés) pour la saison suivante, basé sur l'historique moyen N-1/N-2, la rigueur météo et le stock actuel déclaré. | Moyenne |

## Non-Functional Requirements (NFR)

| ID | Exigence | Description |
| :--- | :--- | :--- |
| **NFR-1** | Architecture de Base de Données | Utilisation de PostgreSQL, optimisée pour le stockage de séries temporelles (Time-Series) et le partitionnement par utilisateur. |
| **NFR-2** | Conteneurisation (Coolify) | Application distribuée via des images Docker avec un `docker-compose.yml` standardisé pour un auto-hébergement sans friction. |
| **NFR-3** | Limitation de Débit (Rate Limiting) | Implémentation stricte d'un rate-limiting sur l'API d'ingestion pour éviter la saturation du serveur et le spam de données. |
| **NFR-4** | Design Responsive & Adaptatif | Interface utilisateur construite en « Mobile-First » capable d'adapter son arborescence de menus et ses graphiques selon les modules activés. |

## User Journeys
**Parcours 1 : Configuration du Profil Énergétique**
1. Lors de sa première connexion ou dans ses réglages, l'utilisateur indique qu'il se chauffe uniquement aux granulés (pas de bois de chauffage).
2. Le système masque instantanément tous les widgets relatifs au bois (stères, bûches) pour ne conserver que le suivi des sacs/palettes de pellets et l'électricité.
3. L'interface reste claire et 100 % adaptée à son installation.

**Parcours 2 : Anticiper la Saison de Chauffe Prochaine**
1. En fin d'hiver (avril/mai), l'utilisateur consulte l'encart « Prévision Réapprovisionnement ».
2. Il met à jour son stock restant actuel (ex. : 12 sacs de granulés en réserve).
3. L'outil analyse sa consommation de l'hiver écoulé, la compare aux moyennes météo, et lui affiche : *« Pour passer l'hiver prochain en toute sérénité, prévoyez l'achat de 2 palettes (132 sacs), pour un coût estimé à ~650 € »*.

**Parcours 3 : Suivi du ROI Solaire et Batterie**
1. L'utilisateur renseigne le coût d'achat initial de son installation solaire et de sa batterie.
2. Il consulte l'onglet « Rentabilité Matérielle ».
3. L'application affiche une jauge de progression indiquant le pourcentage amorti de l'installation et l'économie mensuelle exacte générée.

## Success Metrics
*   **Rétention :** Pourcentage d'utilisateurs consultant le tableau de bord au moins une fois par mois.
*   **Qualité des Données :** Taux de succès des requêtes d'ingestion API (visée : > 99,9 % sans erreurs de validation de schéma).
*   **Engagement Communautaire :** Nombre d'installations auto-hébergées actives et volume de donations générées pour soutenir le projet.

## Timeline
*   **Phase 1 (Socle technique & API) :** Modèle de données PostgreSQL, système d'authentification, endpoints d'ingestion et script/Blueprint Home Assistant.
*   **Phase 2 (Profil & Moteur Tarifaire) :** Masquage dynamique de l'UI selon le profil de chauffage, CRUD pour les contrats, algorithmes de calcul tarifaire et import CSV.
*   **Phase 3 (Rentabilité & Chauffage) :** Tableaux de bord « Chauffage » unifié, estimateur d'achat de combustibles pour la saison N+1, modules de ROI (Solaire + Batterie).
*   **Phase 4 (Communauté & Polish) :** Vues comparatives annuelles avancées, alertes sur les stocks et documentation pour la sortie open-source.

## Decisions
*   **Masquage Conditionnel de l'UI :** *Décision :* L'interface adapte ses composants dynamiquement en fonction du profil énergétique (combustibles déclarés). *Raison :* Évite d'encombrer le tableau de bord avec des sections inutiles (ex. : afficher du bois à quelqu'un qui n'a qu'une pompe à chaleur). *Alternative rejetée :* Dashboard statique identique pour tous.
*   **Mode d'acquisition des données (Push HA) :** *Décision :* Les données et la météo sont envoyées par l'instance Home Assistant vers le SaaS. *Raison :* Maximise la sécurité (aucun port à ouvrir) et garantit que la météo correspond exactement à la micro-localisation du foyer.
*   **Vue « Chauffage » Unifiée & Prédictive :** *Décision :* Agrégation des coûts électriques liés au chauffage et des combustibles solides, couplée à un moteur d'estimation de commande pour la saison suivante. *Raison :* Répond au besoin concret d'anticipation budgétaire des utilisateurs avant l'hiver.
*   **Infrastructure de Données :** *Décision :* PostgreSQL. *Raison :* Robuste pour les données temporelles, support du JSONB, et parfaite compatibilité avec Coolify.

## Open Questions/Assumptions
*   **Calculateur d'Équivalence de Chauffe :** Faut-il inclure un facteur de conversion standard (ex. : 1 kg de granulés ≈ 4,8 kWh) pour estimer la rigueur thermique globale de la maison en kWh équivalents, indépendamment du mode de chauffe utilisé ?
*   **Format standard d'import CSV :** Quel format de CSV (structure de colonnes, format de date ISO 8601) devra être imposé pour l'import historique ?
*   **Fréquence des requêtes API :** HA doit-il envoyer les données toutes les heures, ou un agrégat quotidien à minuit est-il suffisant pour les besoins analytiques ciblés ?