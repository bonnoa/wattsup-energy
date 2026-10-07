# Contribuer à WattsUp Energy

Merci de votre intérêt ! Idées, signalements de bugs et propositions de code sont les
bienvenus.

## Signaler un bug ou proposer une idée

Ouvrez une [issue](https://github.com/bonnoa/wattsup-energy/issues) en précisant la version
(affichée en bas du menu), ce que vous attendiez et ce qui s'est passé. Pour une fuite de
données ou une faille de sécurité, n'ouvrez pas d'issue publique : utilisez
[l'onglet Security](https://github.com/bonnoa/wattsup-energy/security/advisories/new).

## Proposer une modification

1. Installez l'environnement de développement (voir le [README](README.md#développement)).
2. Créez une branche depuis `main`.
3. Gardez les changements ciblés et testés :
   - logique métier pure dans `src/domain` (sans accès à la base), avec ses tests unitaires ;
   - accès aux données dans `src/server`, chaque opération filtrée par le foyer de l'utilisateur
     (`getHouseholdContext()`), avec un test d'intégration et un test d'isolation entre foyers
     (`describeTenantIsolation`) ;
   - toute entrée externe validée avec Zod.
4. Vérifiez que tout passe : `pnpm lint && pnpm test` (et `pnpm test:e2e` si l'interface change).
5. Ouvrez une pull request qui explique le pourquoi du changement.

## Conventions

- Interface et messages en **français** ; code, identifiants et noms de fichiers en anglais.
- Messages de commit : `feat(portée): …`, `fix(portée): …`, `docs: …`, `chore: …`.
- Montants en centimes, heures stockées en UTC, jours et plages tarifaires dans le fuseau du
  foyer.
- Pas de nouvelle dépendance d'exécution sans en discuter d'abord dans une issue.
- Le contrat d'API d'ingestion (`version: 1`) ne change pas de façon incompatible : une
  rupture impose une `version: 2`.

En contribuant, vous acceptez que votre code soit publié sous licence GPL-3.0.
