<p align="center">
  <img src="public/wattsup.svg" alt="" width="96" height="96">
</p>

<h1 align="center">WattsUp Energy</h1>

<p align="center">
  Budget, contrats d'électricité, chauffage et rentabilité solaire du foyer,<br>
  à partir des données que <strong>Home Assistant</strong> lui envoie.
</p>

<p align="center">
  <a href="LICENSE"><img alt="Licence GPL-3.0" src="https://img.shields.io/badge/licence-GPL--3.0-blue"></a>
  <a href="https://github.com/bonnoa/wattsup-energy/pkgs/container/wattsup-energy"><img alt="Image Docker" src="https://img.shields.io/badge/docker-ghcr.io-2496ED"></a>
</p>

---

WattsUp Energy est une application web auto-hébergée. Home Assistant **pousse** chaque heure
(ou chaque jour) les compteurs d'énergie du foyer ; WattsUp les transforme en euros et en
conseils. Aucun port à ouvrir vers Home Assistant : l'application ne l'interroge jamais.

## Fonctionnalités

- **Vue d'ensemble** : coût du mois et projection de l'année, origine de la consommation
  (réseau, solaire, batterie), talon de consommation, heures conseillées pour consommer.
- **Contrats** : Base, Heures creuses, Tempo ; historique des prix, comparaison des offres
  heure par heure sur votre propre consommation.
- **Chauffage** : granulés et bois (stock, achats, sacs versés), coût par saison corrigé de
  la météo, prévision de réapprovisionnement.
- **Rentabilité** : retour sur investissement des panneaux solaires et de la batterie,
  simulateur « Et si… ».
- **Alertes** dans l'appli, par email ou en notification push (stock bas, Home Assistant
  muet, production solaire anormale, budget dépassé).
- **Import CSV** de l'historique, **export** de toutes vos données, résumé lisible par des
  capteurs REST de Home Assistant.
- Multi-comptes (un foyer par compte), inscriptions ouvertes, sur invitation ou fermées,
  thème clair ou sombre, application installable sur mobile.

## Installation

### Prérequis

- Docker et Docker Compose (machine Linux, NAS, Raspberry Pi 4/5 : image `amd64` et `arm64`).
- Un nom de domaine et un reverse proxy en HTTPS (Caddy, Traefik, Nginx Proxy Manager…)
  sont recommandés : l'application installable et les notifications push l'exigent.

### Docker Compose

Créez un dossier `wattsup` contenant ce `docker-compose.yml` :

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: wattsup
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?à définir dans .env}
      POSTGRES_DB: wattsup
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U wattsup"]
      interval: 5s
      retries: 10

  app:
    image: ghcr.io/bonnoa/wattsup-energy:1
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://wattsup:${POSTGRES_PASSWORD}@db:5432/wattsup
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET:?à définir dans .env}
      BETTER_AUTH_URL: ${BETTER_AUTH_URL:?à définir dans .env}
    ports:
      - "3000:3000"

volumes:
  db-data:
```

et ce fichier `.env` à côté :

```bash
# openssl rand -hex 24
POSTGRES_PASSWORD=
# openssl rand -base64 32
BETTER_AUTH_SECRET=
# Adresse publique de l'instance, sans / final
BETTER_AUTH_URL=https://wattsup.exemple.fr
```

Puis :

```bash
docker compose up -d
```

L'application écoute sur le port `3000` ; faites-y pointer votre reverse proxy. Les
migrations de la base sont appliquées au démarrage.

**Premier compte** : ouvrez l'adresse de l'instance et créez votre compte. Le premier compte
créé devient **administrateur** : il gère les comptes, les inscriptions (ouvertes, sur
invitation ou fermées) et les textes de la page Contact. Pensez à fermer les inscriptions
ou à les passer sur invitation si l'instance est exposée sur Internet.

### Autres plateformes

L'image `ghcr.io/bonnoa/wattsup-energy` fonctionne telle quelle sur Coolify, Portainer,
Unraid ou Kubernetes : il suffit d'une base PostgreSQL 16 et des variables ci-dessous.
Sur Coolify, vous pouvez aussi déployer directement depuis ce dépôt (Dockerfile).

### Variables d'environnement

| Variable                                                 | Rôle                                                                                                                                                           |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                           | **Obligatoire.** Connexion PostgreSQL 16.                                                                                                                      |
| `BETTER_AUTH_SECRET`                                     | **Obligatoire.** Secret des sessions, 32 caractères au moins.                                                                                                  |
| `BETTER_AUTH_URL`                                        | **Obligatoire.** Adresse publique de l'instance.                                                                                                               |
| `SIGNUP_MODE`, `INVITE_CODES`                            | Inscriptions au démarrage : `open` (défaut), `invite` (codes séparés par des virgules) ou `closed`. Ensuite réglables par l'administrateur.                    |
| `RESEND_API_KEY`, `MAIL_FROM`                            | Envoi d'emails par [Resend](https://resend.com) : mot de passe oublié, confirmation d'adresse, alertes, page Contact. Sans elles, ces fonctions disparaissent. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Notifications push. Clés générées une fois avec `npx web-push generate-vapid-keys` ; `VAPID_SUBJECT` : `mailto:…` ou l'adresse de l'instance.                  |
| `TEMPO_SYNC`, `WEATHER_SYNC`                             | `off` pour couper les seuls appels sortants : calendrier Tempo (api-couleur-tempo.fr) et météo (Open-Meteo, coordonnées arrondies de la commune).              |
| `RUN_MIGRATIONS`                                         | `off` pour ne pas appliquer les migrations au démarrage.                                                                                                       |

Un exemple commenté se trouve dans [`.env.example`](.env.example).

### Mise à jour

```bash
docker compose pull && docker compose up -d
```

Le tag `1` suit les versions 1.x ; utilisez un tag précis (`1.0.0`) pour figer la version.

### Sauvegarde

Toutes les données sont dans PostgreSQL :

```bash
docker compose exec db pg_dump -U wattsup wattsup | gzip > wattsup-$(date +%F).sql.gz
```

## Connecter Home Assistant

Dans WattsUp, **Réglages › API d'ingestion** donne l'adresse d'envoi et un token. Le
blueprint d'automatisation fourni (`homeassistant/blueprints`, aussi servi par votre instance)
envoie ensuite les compteurs chaque heure. Le parcours de bienvenue guide pas à pas ; le
détail est dans [`homeassistant/README.md`](homeassistant/README.md) et dans le
[wiki](https://github.com/bonnoa/wattsup-energy/wiki).

## Développement

Node.js 22, pnpm 9 (`corepack enable`), Docker pour PostgreSQL.

```bash
docker compose up -d db        # PostgreSQL local (bases wattsup et wattsup_test)
cp .env.example .env.local
pnpm install
pnpm db:migrate && pnpm db:seed  # compte de démo : voir .env.example
pnpm dev                       # http://localhost:3000
pnpm lint && pnpm test         # lint, types, tests unitaires et d'intégration
pnpm test:e2e                  # parcours Playwright sur un build de production
```

Next.js (App Router), TypeScript, PostgreSQL avec Drizzle, Better Auth, Tailwind CSS. Voir
[CONTRIBUTING.md](CONTRIBUTING.md) pour proposer une modification.

## Licence et soutien

WattsUp Energy est un logiciel libre sous licence [GPL-3.0](LICENSE).

Le projet vous rend service ? Vous pouvez soutenir son développement :
[Buy me a coffee](https://www.buymeacoffee.com/kraftpunk) ☕
