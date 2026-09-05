# Piloter la base depuis GitHub (sans terminal)

Le workflow [`.github/workflows/database.yml`](../.github/workflows/database.yml) fait, sur un runner GitHub, ce qu'on ferait normalement dans un terminal avec la CLI Supabase : rejouer les migrations, régénérer les types, importer un changement fait dans le dashboard, appliquer les migrations en prod.

Tout se lance à la main depuis un téléphone.

## Lancer une commande

**Onglet Actions → « Base de données » → _Run workflow_** : on choisit la branche, puis la commande, et c'est parti. Le bouton existe aussi dans le navigateur mobile.

Le résultat arrive dans le résumé du run et, si la branche a une PR ouverte, en commentaire sur cette PR.

## Les commandes

| Commande | Ce que ça fait                                                                                                          | Écrit dans le dépôt | Touche la prod |
| -------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------- | -------------- |
| `check`  | démarre une base neuve, rejoue **toutes** les migrations, lint SQL, vérifie que `database.ts` correspond au schéma      | non                 | non            |
| `types`  | régénère `src/data-access/models/database.ts` et le commite sur la branche choisie                                      | oui                 | non            |
| `pull`   | importe le schéma distant en nouvelle migration (+ types) et commite — pour rattraper une modif faite dans le dashboard | oui                 | non            |
| `plan`   | `supabase db push --dry-run` : liste les migrations qui partiraient, sans rien appliquer                                | non                 | non            |
| `push`   | applique les migrations en attente au projet Supabase distant                                                           | non                 | **oui**        |

### Les enchaînements typiques

- **Une PR ajoute une migration** → `check` sur la branche de la PR pour valider le replay et le lint, puis `types` si le compte-rendu signale que `database.ts` est décalé. Une fois la PR mergée : `plan` sur `main`, puis `push`.
- **Un changement fait à la main dans le dashboard Supabase** → lancer `pull` sur une branche dédiée : la migration correspondante et les types sont générés et commités, il ne reste qu'à ouvrir la PR et relire le SQL.
- **Un doute sur ce qui est déjà en prod** → `plan` : la sortie liste les migrations que la base distante ne connaît pas encore.

Le job e2e de _Quality Checks_ applique déjà les migrations en démarrant la stack, mais il ne dit rien du replay complet, du lint, ni de la dérive des types : c'est ce que `check` ajoute, pour bien moins long.

## Configurer les secrets

**Settings → Secrets and variables → Actions → New repository secret.** Les trois premiers sont nécessaires à `pull`, `plan` et `push` ; `check` et `types` n'en demandent aucun (tout se passe sur une base locale au runner).

| Secret                  | Où le trouver                                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN` | [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) → _Generate new token_ → valeur `sbp_…`                 |
| `SUPABASE_PROJECT_ID`   | la référence du projet : Project Settings → General → _Reference ID_, ou le segment d'URL `https://supabase.com/dashboard/project/<référence>` |
| `SUPABASE_DB_PASSWORD`  | Project Settings → Database → _Database password_                                                                                              |
| `GH_PAT` (optionnel)    | voir plus bas — sert uniquement à relancer la CI sur les commits du workflow                                                                   |

### Le jeton d'accès Supabase, en détail

1. Se connecter à [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) (l'écran fonctionne bien sur mobile).
2. _Generate new token_, lui donner un nom explicite : `github-actions-onmangekoi`.
3. **Copier la valeur tout de suite** : elle commence par `sbp_` et n'est affichée qu'une seule fois.
4. La coller dans le secret GitHub `SUPABASE_ACCESS_TOKEN`.

Ce jeton est **personnel et lié au compte, pas au projet** : il donne accès à tous les projets de l'organisation. Il se révoque depuis le même écran, ce qui invalide immédiatement le workflow — c'est le geste à faire au moindre doute, quitte à en régénérer un dans la foulée.

Le mot de passe de base (`SUPABASE_DB_PASSWORD`) est celui du rôle `postgres` : la CLI en a besoin pour se connecter directement à l'instance. S'il a été perdu, il se réinitialise dans Project Settings → Database — penser à le mettre à jour partout où il est utilisé.

Une fois enregistrés, ces secrets ne sont plus lisibles, y compris par toi : GitHub les masque dans les logs, et le compte-rendu masque en plus les identifiants d'une éventuelle URL de connexion.

### Le PAT GitHub (optionnel)

GitHub refuse volontairement de déclencher un workflow depuis un commit poussé avec le `GITHUB_TOKEN` intégré — sinon une action pourrait s'auto-relancer en boucle. Conséquence : après un `types` ou un `pull`, _Quality Checks_ ne se relance pas tout seul sur le nouveau commit.

Deux solutions, au choix :

- ne rien faire, et relancer _Quality Checks_ à la main depuis l'onglet Actions (bouton _Re-run all jobs_, disponible sur mobile) ;
- créer un [fine-grained PAT](https://github.com/settings/personal-access-tokens/new) limité à ce dépôt, avec les permissions **Contents : Read and write** et **Pull requests : Read and write**, et l'enregistrer dans le secret `GH_PAT`. Le workflow le préfère au jeton intégré dès qu'il existe.

## Garde-fous

- Le workflow ne se déclenche que manuellement : aucun événement automatique, et lancer un workflow demande d'avoir les droits d'écriture sur le dépôt.
- `push` s'exécute dans l'environnement GitHub `production`. En ajoutant un _required reviewer_ dans **Settings → Environments → production**, chaque `push` devient une demande d'approbation à valider d'un tap (l'app mobile GitHub gère les approbations de déploiement).
- `plan` avant `push` : la sortie du dry-run est aussi affichée au début du job `push`, avant application.

## Limites connues

- Le bouton _Run workflow_ n'apparaît qu'une fois le workflow présent **sur la branche par défaut** — c'est une règle GitHub. Tant que la PR qui l'introduit n'est pas mergée, il n'y a rien à lancer ; ensuite, n'importe quelle branche est sélectionnable.
- `pull` génère du SQL par différence de schéma : c'est un point de départ à relire, pas une migration écrite à la main. Les renommages, en particulier, ressortent souvent en `drop` + `create`.
- Le compte-rendu ne garde que les 6 derniers Ko de sortie ; le log complet reste dans le run.
