# Changelog et versions

Deux journaux, deux publics — et un seul geste manuel dans toute la chaîne.

| Journal                            | Pour qui          | Écrit par                       | Où on le lit                                  |
| ---------------------------------- | ----------------- | ------------------------------- | --------------------------------------------- |
| `CHANGELOG.md` + releases GitHub   | qui lit le code   | **généré** depuis les commits   | le dépôt                                      |
| `src/content/changelog/entries.ts` | qui utilise l'app | **rédigé** après chaque release | la page `/nouveautes` du site et son flux RSS |

La raison de ce dédoublement tient en une ligne : `feat(routing): adresser les sessions par leur code court` est une phrase de développeur. L'utilisateur, lui, retient « le lien d'invitation tient en six caractères ». Aucun générateur ne fait cette traduction — donc on l'écrit.

## Le circuit

```
commit conventionnel        →  PR de release          →  release publiée        →  note produit
feat(session): …               release-please tient      tag vX.Y.Z + notes        issue ouverte
fix(places): …                 une PR à jour             CHANGELOG.md à jour       automatiquement
                               (version, changelog)                                → entries.ts → /nouveautes
```

1. **Les commits.** `commitlint` impose déjà [Conventional Commits](https://www.conventionalcommits.org/fr/) au moment du commit. C'est ce qui rend la suite automatique.
2. **La PR de release.** À chaque push sur `main`, le workflow [`release.yml`](../.github/workflows/release.yml) fait tourner [release-please](https://github.com/googleapis/release-please) : il maintient une PR « chore: release X.Y.Z » qui accumule les commits, calcule la version, met à jour `CHANGELOG.md` et `package.json`.
3. **La publication.** Fusionner cette PR crée le tag `vX.Y.Z` et la release GitHub. Rien d'autre à faire.
4. **La note produit.** Le même workflow ouvre alors une issue « Note de version produit — vX.Y.Z », avec les commits déjà classés et le gabarit à remplir. Elle ne se ferme qu'en ajoutant l'entrée dans `entries.ts`.

Le workflow ne rédige jamais la note à la place de quelqu'un, et il ne rouvre pas d'issue si la version est déjà annoncée dans `entries.ts` (il vérifie avant).

## Quelle version sort de quels commits

| Commit                                                   | Effet sur la version (avant la 1.0) |
| -------------------------------------------------------- | ----------------------------------- |
| `fix:`, `perf:`                                          | patch — `0.1.0` → `0.1.1`           |
| `feat:`                                                  | mineure — `0.1.0` → `0.2.0`         |
| `feat!:` ou `BREAKING CHANGE:`                           | mineure — `0.1.0` → `0.2.0`         |
| `chore:`, `docs:`, `ci:`, `test:`, `refactor:`, `style:` | aucun                               |

`bump-minor-pre-major` est actif : tant qu'on est en `0.x`, une rupture reste une version mineure. Le jour où le projet passe en `1.0.0`, une rupture deviendra une majeure sans rien changer à la configuration.

## Écrire une note produit

Une entrée s'ajoute **en tête** de `src/content/changelog/entries.ts` :

```ts
{
  version: '1.2.0',
  date: '2026-10-12',
  title: 'Le vote qui va au bout',
  summary: 'Une session ne reste plus bloquée sur un votant parti déjeuner.',
  changes: [
    {
      kind: 'new',
      title: 'Un chrono sur le vote',
      description:
        'Le host peut donner cinq minutes au groupe. À la fin du compte à rebours, le classement s’affiche avec les votes reçus.',
    },
  ],
}
```

| Champ                   | Règle                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `version`               | `X.Y.Z`, exactement celle de la release — c'est elle qui fait le lien vers le tag                                 |
| `date`                  | `AAAA-MM-JJ`, jamais dans le futur                                                                                |
| `title`                 | un nom, pas une liste : « Sortir du quartier », « Le vote qui va au bout »                                        |
| `summary`               | une phrase, ce que la version change pour le groupe qui vote                                                      |
| `changes[].kind`        | `new` (on peut faire quelque chose de plus) · `improved` (c'était là, c'est mieux) · `fixed` (ça ne marchait pas) |
| `changes[].description` | deux phrases au plus, sans nom de fichier ni numéro d'issue                                                       |

Trois garde-fous, tous vérifiés par `bun run test` :

- le schéma Zod (`types.ts`) — format de version, longueurs, au moins un changement ;
- pas deux fois la même version ;
- aucune date dans le futur.

Ce qui ne se voit pas à l'usage n'a rien à faire ici. Une refonte interne, une migration, un test ajouté : le `CHANGELOG.md` les porte déjà.

## Ce que voient les utilisateurs

- **`/nouveautes`** — la page, prérendue, une carte par version, de la plus récente à la première.
- **Une pastille dans l'en-tête** — allumée quand une version est parue depuis la dernière visite. Le repère (`omk.changelog`, un simple numéro de version) vit dans le navigateur, jamais sur le serveur, et se pose tout seul à la première visite : personne ne se fait annoncer « du nouveau » le jour où il découvre l'app.
- **`/nouveautes/rss.xml`** — le même contenu en RSS, pour suivre sans revenir ni laisser d'adresse email.
- **Un lien en pied de page**, sur toutes les pages.

Côté mesure, ouvrir la page émet `changelog_opened` avec le seul numéro de version — comme tout le reste, sous consentement (voir [`analytics.md`](analytics.md)).

## Où ça vit

```
release-please-config.json          types de commits, sections du changelog, stratégie de version
.release-please-manifest.json       version courante, tenue à jour par le bot
.github/workflows/release.yml       PR de release, tag, release GitHub, issue de note produit
CHANGELOG.md                        généré — ne pas éditer à la main
src/content/changelog/types.ts      schéma Zod d'une note
src/content/changelog/entries.ts    les notes, la plus récente en tête ← le seul fichier à éditer
src/content/changelog/index.ts      tri par version, dernière version publiée
src/components/changelog/           la carte d'une note, la pastille de l'en-tête, le marqueur de lecture
src/app/(app)/nouveautes/           la page et son flux RSS
src/lib/changelog-seen.ts           le repère de lecture, côté navigateur
src/lib/version.ts                  comparaison de versions sémantiques
```

## Secrets et permissions

Le workflow tourne avec le `GITHUB_TOKEN` par défaut (`contents: write`, `pull-requests: write`, `issues: write`). Un secret `GH_PAT` est utilisé s'il existe : sans lui, la PR ouverte par le bot ne déclenche pas la CI — limitation GitHub, pas du projet. Le reste fonctionne à l'identique.
