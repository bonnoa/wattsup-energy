# Home Assistant → WattsUp Energy

Home Assistant **pousse** ses données vers WattsUp : aucun port entrant à ouvrir,
WattsUp n'interroge jamais votre instance. Contrat d'API : voir `docs/SPEC.md` §6.

## 1. Récupérer l'endpoint et le token

Dans WattsUp : **Réglages › API d'ingestion**.

1. Choisissez la granularité :
   - **Horaire** (recommandé) : HA envoie ses index cumulés chaque heure. Toutes les
     simulations de contrats sont exactes.
   - **Quotidien** : HA envoie une fois par jour les totaux de la veille, lus sur des
     `utility_meter` quotidiens (HP et HC séparés si vous êtes en HP/HC ou Tempo).
2. Cliquez **Générer un token** et copiez-le : il n'est affiché qu'une fois.

## 2. Déclarer le `rest_command`

Dans `secrets.yaml` :

```yaml
wattsup_url: https://wattsup-energy.kraftpunk.app/api/v1/ingest
wattsup_token: "Bearer wu_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

Dans `configuration.yaml` (puis redémarrer Home Assistant) :

```yaml
rest_command:
  wattsup_push:
    url: !secret wattsup_url
    method: POST
    headers:
      Authorization: !secret wattsup_token
      Content-Type: application/json
    payload: "{{ payload if payload is string else payload | to_json }}"
    timeout: 15
```

## 3. Importer le blueprint

**Paramètres › Automatisations et scènes › Blueprints › Importer un blueprint**, URL :

```
https://github.com/bonnoa/wattsup-energy/blob/main/homeassistant/blueprints/wattsup_push.yaml
```

> Tant que le dépôt est privé, l'import par URL ne fonctionne pas : copiez le fichier
> `wattsup_push.yaml` dans `config/blueprints/automation/wattsup/` puis rechargez les
> automatisations.

Créez ensuite une automatisation à partir du blueprint.

### Mode horaire

| Champ                                                  | Entité attendue                                                  |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| Import réseau                                          | compteur cumulé du linky / de la pince (kWh, `total_increasing`) |
| Export, production solaire, charge / décharge batterie | compteurs cumulés correspondants (optionnels)                    |
| Température extérieure                                 | capteur de température local                                     |
| Couleur Tempo                                          | optionnel : capteur dont l'état vaut bleu / blanc / rouge        |
| Postes                                                 | `slug: sensor.xxx_energy`, slugs copiés depuis WattsUp           |

Le premier envoi sert de référence (avertissement `baseline`) ; les consommations
apparaissent à partir du deuxième.

### Mode quotidien

Créez des `utility_meter` avec `cycle: daily`. Le blueprint lit, à 00:05, leur
attribut `last_period` (total de la veille). En HP/HC, le plus simple est de partir des
deux index séparés que fournit le Linky (téléinfo : index HC et index HP) :

```yaml
utility_meter:
  wattsup_import_hp_jour:
    source: sensor.linky_index_hp
    cycle: daily
  wattsup_import_hc_jour:
    source: sensor.linky_index_hc
    cycle: daily
  wattsup_solaire_jour:
    source: sensor.enphase_production_cumulee
    cycle: daily
```

Sans index séparés, un seul `utility_meter` avec `tariffs: [hp, hc]` fonctionne aussi,
mais il faut alors basculer son entité `select` entre `hp` et `hc` aux heures de votre
contrat (automatisation dédiée).

Renseignez **Import HP** et **Import HC** (ou **Import réseau** seul pour un contrat
Base). Pour la météo, utilisez trois capteurs `statistics` (min, max, moyenne sur 24 h).

## 4. Vérifier

- WattsUp : « Home Assistant connecté · Dernier push il y a X min » dans la navigation.
- Home Assistant : en cas de refus (token, mode, format), une notification persistante
  « WattsUp Energy — envoi refusé ou vide » affiche le statut et le message de l'API ;
  elle disparaît au premier envoi accepté contenant des données.

| Statut                 | Cause probable                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 401                    | token absent, mal recopié (le préfixe `Bearer ` est requis) ou révoqué                                                                            |
| 409                    | granularité du blueprint ≠ granularité choisie dans WattsUp                                                                                       |
| 400                    | champ invalide : le message indique lequel                                                                                                        |
| 200 + `no_energy_data` | aucun capteur lisible : en mode quotidien, ce ne sont pas des `utility_meter` (pas d'attribut `last_period`) ; en horaire, capteurs indisponibles |
| 429                    | plus de 120 envois par minute (automatisation en boucle ?)                                                                                        |
