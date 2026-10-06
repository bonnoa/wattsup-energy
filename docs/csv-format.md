# Format d'import CSV

L'import CSV (Réglages › Import de l'historique) remplit le passé avant la connexion de
Home Assistant, ou comble un trou. Spécification : `docs/SPEC.md` §7.7.

## Colonnes

```
timestamp,metric,kwh[,tariff_slot]
```

- **En-tête** facultatif (première ligne commençant par `timestamp`).
- **Séparateur** : la virgule. **Décimales** : le point (`0.412`, jamais `0,412`).
- Une ligne par période et par métrique ; lignes vides ignorées ; fins de ligne `\n` ou `\r\n`.

| Colonne | Contenu |
|---|---|
| `timestamp` | ISO 8601. **Heure** (`2024-01-01T00:00:00+01:00`, `2024-01-01T00:00:00Z` ou `2024-01-01T00:00`) pour une ligne horaire, qui doit commencer à une heure pile ; sans décalage, l'heure est celle du fuseau du foyer. **Date seule** (`2024-01-01`) pour une ligne quotidienne. |
| `metric` | `grid_import`, `grid_export`, `solar_production`, `battery_charge`, `battery_charge_grid`, `battery_discharge`, ou `category:<slug>` pour un poste existant (Réglages › Postes de consommation). |
| `kwh` | Énergie de la période en kWh, positive : un **delta**, pas un index de compteur. |
| `tariff_slot` | Lignes quotidiennes de `grid_import` seulement : `hp` ou `hc`. Absent : toute la journée. |

## Exemples

Foyer en envoi horaire :

```
timestamp,metric,kwh
2024-01-01T00:00:00+01:00,grid_import,0.412
2024-01-01T00:00:00+01:00,solar_production,0
2024-01-01T01:00:00+01:00,grid_import,0.388
```

Foyer en envoi quotidien :

```
timestamp,metric,kwh,tariff_slot
2024-01-01,grid_import,6.82,hp
2024-01-01,grid_import,3.10,hc
2024-01-01,solar_production,4.2
```

## Règles

- Les lignes doivent suivre la **granularité du foyer** (Réglages › API d'ingestion) : un
  foyer horaire refuse les lignes quotidiennes et inversement, pour ne jamais compter deux
  fois la même énergie.
- Une ligne invalide est **rejetée avec son motif** sans bloquer les autres ; le rapport
  (numéro de ligne, contenu, motif) est téléchargeable après l'import.
- Une période déjà importée par CSV est **remplacée**. Une période déjà reçue de **Home
  Assistant est conservée** : HA fait foi. Un envoi HA ultérieur remplace la donnée CSV.
- Dans un même fichier, si une période apparaît deux fois, la dernière valeur l'emporte.
- Limites : **20 Mo** et **500 000 lignes** par fichier ; au-delà, l'import s'arrête et le
  rapport le signale. Écriture par lots de 5 000 lignes.
- Dates acceptées : depuis le 1er janvier d'il y a **10 ans**, jusqu'à aujourd'hui.
- Une valeur invraisemblable est rejetée : plus de 36 kWh en une heure pour l'import, l'export
  et les postes, 50 kWh pour la production solaire, 20 kWh pour la batterie (× 24 pour une
  ligne quotidienne).
- **Un import à la fois**, **10 imports par heure** au plus, et **2 000 000 de valeurs** au plus
  par foyer.
