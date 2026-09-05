# Roadmap

Ce document classe les [issues ouvertes](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues) par **priorité** et les répartit dans des **versions cibles**. Il double l'information portée par les labels GitHub (`priority: P0`…`P3`, `v1.1`…`v2.0`) pour qu'on puisse arbitrer sans ouvrir la liste des issues.

L'état de départ est le MVP livré : sessions, vote à quatre valeurs, jokers, listes partagées, codes Crockford, QR, Realtime, RLS et RPC durcies.

## Échelle de priorité

| Priorité | Sens                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------- |
| **P0**   | Bloquant : l'app est inutilisable hors du quartier seedé, ou une obligation légale n'est pas couverte |
| **P1**   | Fort impact sur le parcours ou sur l'exploitation ; à faire dans la version courante                  |
| **P2**   | Vraie valeur mais le produit tient sans ; peut glisser d'une version                                  |
| **P3**   | Confort, élargissement d'audience ; à faire quand le cœur est stable                                  |

## Classement global

| #   | Issue                                                                                                 | Priorité | Version | Pourquoi ce rang                                                                |
| --- | ----------------------------------------------------------------------------------------------------- | -------- | ------- | ------------------------------------------------------------------------------- |
| 1   | [#3 Ajout manuel d'un restaurant](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/3)        | P0       | v1.1    | Débloque #2, #4 et #17 : c'est lui qui introduit `source`, `created_by`         |
| 2   | [#2 Import Google Places](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/2)                | P0       | v1.1    | Sans lui l'app ne sert qu'aux quartiers seedés à la main                        |
| 3   | [#21 RGPD : suppression et export](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/21)      | P0       | v1.1    | Obligation légale dès qu'un email peut être lié — c'est déjà le cas             |
| 4   | [#12 Anti-abus : rate limit et captcha](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/12) | P1       | v1.1    | Un code à 6 caractères ne tient que si les essais sont limités                  |
| 5   | [#13 Purge des anonymes inactifs](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/13)       | P1       | v1.1    | Coût et rétention : `auth.users` grossit à chaque pseudo, purge encore manuelle |
| 6   | [#18 Analytics produit (PostHog)](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/18)       | P1       | v1.1    | À poser avant v1.2, sinon les arbitrages suivants se font à l'aveugle           |
| 7   | [#9 Vote chronométré](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/9)                    | P1       | v1.2    | Le blocage n° 1 en vrai usage : une session qui n'aboutit pas faute d'un votant |
| 8   | [#10 Départage des égalités](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/10)            | P1       | v1.2    | Petit effort, ferme le parcours : aujourd'hui le groupe repart en débat         |
| 9   | [#17 Fiche restaurant enrichie](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/17)         | P1       | v1.2    | Suite directe de #2 : voter sans photo ni adresse, puis sans itinéraire         |
| 10  | [#6 Historique et statistiques](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/6)          | P1       | v1.2    | Rend les sessions passées consultables et débloque #5                           |
| 11  | [#15 Accessibilité : audit axe en CI](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/15)   | P1       | v1.2    | Garde-fou à installer avant que l'UI ne grossisse                               |
| 12  | [#19 Partage public des résultats](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/19)      | P2       | v1.2    | Premier levier d'acquisition, mais dépend d'un parcours déjà propre             |
| 13  | [#11 PWA installable](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/11)                   | P2       | v1.3    | Ouvre la boucle de rétention et conditionne #7                                  |
| 14  | [#7 Notifications push](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/7)                  | P2       | v1.3    | Règle l'invité qui a fermé l'onglet ; nécessite le service worker de #11        |
| 15  | [#5 Anti-fatigue](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/5)                        | P2       | v1.3    | Cité dans le README ; s'appuie sur l'historique livré en v1.2                   |
| 16  | [#8 Groupes récurrents](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/8)                  | P2       | v1.3    | Supprime la ressaisie du code pour l'équipe du midi                             |
| 17  | [#20 Connexion Google et Apple](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/20)         | P2       | v1.3    | Confort : le parcours email existe déjà et fonctionne                           |
| 18  | [#4 Filtres budget, distance, régime](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/4)    | P2       | v2.0    | Utile quand la base est grande — donc après #2 et #3                            |
| 19  | [#16 Règles de vote personnalisables](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/16)   | P3       | v2.0    | Les règles fixes conviennent à la majorité des groupes                          |
| 20  | [#14 Internationalisation (anglais)](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/14)    | P3       | v2.0    | Élargit l'audience, mais fige d'abord les textes                                |

## Versions cibles

### v1.1 — « Sortir du quartier »

Rendre l'app utilisable partout et conforme. Aucune de ces six issues n'est reportable : les deux premières lèvent le plafond d'usage, les quatre suivantes couvrent le légal, la sécurité et l'exploitation.

- P0 — #3 Ajout manuel d'un restaurant
- P0 — #2 Import Google Places _(dépend de #3)_
- P0 — #21 RGPD : suppression du compte et export
- P1 — #12 Anti-abus : rate limit sur « Rejoindre » et captcha
- P1 — #13 Purge des anonymes inactifs et sessions périmées
- P1 — #18 Analytics produit (PostHog)

### v1.2 — « Le vote qui va au bout »

Fermer le parcours de bout en bout : une session se termine toujours, et les résultats mènent quelque part.

- P1 — #9 Vote chronométré
- P1 — #10 Départage des égalités
- P1 — #17 Fiche restaurant enrichie _(dépend de #2)_
- P1 — #6 Historique des sessions et statistiques
- P1 — #15 Accessibilité : audit axe automatisé
- P2 — #19 Partage public des résultats

### v1.3 — « Revenir chaque midi »

Installer la boucle de rétention, une fois le parcours fiable.

- P2 — #11 PWA installable
- P2 — #7 Notifications push _(dépend de #11)_
- P2 — #5 Anti-fatigue _(dépend de #6)_
- P2 — #8 Groupes récurrents
- P2 — #20 Connexion Google et Apple

### v2.0 — « Sur mesure »

Confort et élargissement, une fois le cœur stable.

- P2 — #4 Filtres budget, distance, régime alimentaire
- P3 — #16 Règles de vote personnalisables par session
- P3 — #14 Internationalisation (anglais)

## Dépendances

```
#3 Ajout manuel ──▶ #2 Google Places ──┬──▶ #17 Fiche enrichie
                                        └──▶ #4 Filtres
#6 Historique ─────▶ #5 Anti-fatigue
#11 PWA ───────────▶ #7 Notifications push
```

Une issue n'entre jamais dans une version antérieure à celle dont elle dépend.

## Tenir ce document à jour

Les labels GitHub font foi : `priority: P0`…`priority: P3` pour le rang, `v1.1`…`v2.0` pour la version cible. Ce fichier est le résumé lisible du même classement — le mettre à jour en même temps que les labels.
