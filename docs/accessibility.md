# Accessibilité

Ce document décrit les garde-fous automatiques, ce qu'ils couvrent, ce qu'ils ne couvrent pas, et la marche à suivre quand l'un d'eux casse. Le résumé est dans le [README](../README.md#accessibilité).

## Ce qui tourne, et où

| Garde-fou                | Commande                  | Fichier                                     |
| ------------------------ | ------------------------- | ------------------------------------------- |
| Audit axe du parcours    | `bun run test:e2e`        | `e2e/accessibility.spec.ts`                 |
| Contraste des tokens     | `bun run test`            | `src/app/theme-contrast.test.ts`            |
| Rôle et nom accessible   | `bun run test`            | `src/components/ui/*.test.tsx`              |
| Clavier et annonces      | `bun run test`            | `src/components/session/vote-deck.test.tsx` |
| Lighthouse Accessibilité | `bun run test:lighthouse` | `.lighthouserc.json`                        |

Les deux premiers et le dernier tournent dans le job **End-to-end · Axe · Lighthouse** de `.github/workflows/quality.yml` ; les tests unitaires et composants dans le job **Quality Checks**.

## Audit axe

`e2e/support/a11y.ts` expose `auditA11y(page, testInfo, nom)`. Chaque appel injecte axe dans la page telle que le test l'a laissée et analyse le DOM rendu.

- **Règles retenues** : `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`. Les règles `best-practice` d'axe sont des conseils, pas des critères : elles ne font pas échouer le job.
- **Seuil d'échec** : `serious` et `critical`. Ce sont les violations qui empêchent réellement quelqu'un d'utiliser la page. Les `minor` et `moderate` restent visibles dans le rapport.
- **Rapport** : dès qu'une violation est trouvée, la liste complète part en pièce jointe du test (`axe-<page>.json`). En CI, elle arrive dans l'artefact `playwright-report`.

Pages traversées : accueil, rejoindre, connexion, confidentialité, pseudo, création de session, salle d'attente (host et invité), vote, classement, listes, nouvelle liste, compte. L'accueil, le vote et le classement sont audités **dans les deux thèmes** — `page.emulateMedia({ colorScheme: 'dark' })` suffit, `next-themes` écoute la media query.

### Quand l'audit casse

L'échec nomme la règle, son impact et les trois premiers sélecteurs fautifs :

```
color-contrast (serious) — Elements must have sufficient color contrast → .text-fav
```

Ouvrir la pièce jointe JSON pour le détail (couleurs calculées, contexte HTML), corriger, relancer `bun run test:e2e` en local. Une règle qui remonte un faux positif se désactive au cas par cas dans le helper (`AxeBuilder.disableRules`) — avec un commentaire disant pourquoi. Ne pas élargir le filtre d'impact pour faire passer un job.

## Contraste des tokens

`src/app/theme-contrast.test.ts` lit `src/app/globals.css` — les vraies valeurs, pas une copie — et vérifie chaque paire couleur/fond réellement posée dans l'interface :

- **4.5:1** pour le texte courant (WCAG 2.1 AA, 1.4.3) ;
- **3:1** pour ce qui n'est pas du texte : icône décorative, anneau de focus (1.4.11).

Le calcul vit dans `src/lib/contrast.ts`. Chaque paire porte son usage (« bouton Coup de cœur au repos », « anneau de focus dans une carte ») : un échec dit du même coup quel écran regarder.

**Retoucher une teinte, c'est repasser par ce test.** Si une couleur ne peut pas descendre sans perdre son caractère, la bonne réponse est souvent de changer le fond sur lequel elle est posée, ou d'inverser le texte (`text-surface` sur aplat plein) plutôt que d'assouplir le seuil.

Deux tokens échappent volontairement au seuil texte :

- `--faint` ne peint plus que des icônes décoratives ; les deux endroits où il servait de texte (placeholder, référence d'erreur) sont passés à `--ink-muted` ;
- `--line` et `--line-strong` sont des bordures : ni axe ni Lighthouse ne les évaluent, et le test ne les couvre pas non plus. Un contrôle qui ne se distingue **que** par sa bordure devrait viser 3:1 (1.4.11).

## Clavier

Le deck de vote est le seul écran à raccourcis. La table des touches vit dans `src/domain/vote.ts` (`VOTE_ACTIONS[].shortcuts`), écrite comme `KeyboardEvent.key` — c'est aussi la forme attendue par `aria-keyshortcuts`, qui les annonce aux lecteurs d'écran. Ajouter un raccourci se fait là, une fois : les boutons, le texte d'aide sous le deck et l'écouteur clavier en descendent tous.

Deux règles portées par le code :

- une saisie en cours garde ses touches (`input`, `textarea`, `select`, `contenteditable`) ;
- `Entrée` sur un bouton ou un lien qui a le focus ne vote pas deux fois : l'activation native fait déjà le travail.

Le focus visible est vérifié à la tabulation par `expectVisibleFocusRing` : chaque arrêt doit matcher `:focus-visible` **et** porter un contour ou un anneau.

L'anneau reste **opaque**. Ce détail n'en est pas un : le même anneau à 40 % d'opacité se compose avec le fond et retombe autour de 1,9:1, loin des 3:1 que la 1.4.11 demande à un indicateur de focus. Sur les champs, la bordure qui passe de `--line-strong` à `--brand` ne vaut que 2,9:1 entre les deux états : c'est l'anneau, pas elle, qui porte l'indication. Ni axe ni Lighthouse ne mesurent ça — c'est une règle à tenir à la relecture.

## Lighthouse

`bun run test:lighthouse` lance `@lhci/cli` (épinglé) sur les cinq pages publiques, catégorie Accessibilité seulement, et échoue sous **0,95**. Le binaire Chrome se choisit par `CHROME_PATH` ; en CI c'est le Chromium que Playwright vient d'installer, pour n'avoir qu'une version de navigateur dans le job.

En local, avec la stack Supabase démarrée :

```bash
bun run build
CHROME_PATH=$(bun -e "console.log(require('playwright-core').chromium.executablePath())") bun run test:lighthouse
```

Les rapports atterrissent dans `.lighthouseci/` (ignoré par git), et en CI dans l'artefact `lighthouse-report` quand le seuil n'est pas tenu.

## Ce que l'automatique ne voit pas

Un audit axe vert ne dit pas que la page est utilisable. Restent à la relecture humaine :

- l'ordre de tabulation quand il ne suit pas l'ordre visuel ;
- la pertinence d'un libellé (`aria-label` juste mais incompréhensible) ;
- le contenu réellement annoncé par un lecteur d'écran sur les régions live ;
- la lisibilité d'une photo de restaurant sous le voile de la carte de vote ;
- le zoom à 200 % et les préférences système (`prefers-reduced-motion` est respecté, `prefers-contrast` ne l'est pas encore).
