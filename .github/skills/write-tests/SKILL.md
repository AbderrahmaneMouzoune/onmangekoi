---
name: write-tests
description: Génère des tests pour du code onmangekoi — Jest, React Testing Library ou Playwright selon le contexte
---

# Write Tests

Génère des tests adaptés au contexte pour onmangekoi. Demande le fichier cible et le type de test si non fournis.

Demande les informations suivantes si non précisées :

- **Fichier ou composant** à tester
- **Type de test** : unitaire (Jest), composant (React Testing Library), ou E2E (Playwright)
- **Cas à couvrir** : happy path, edge cases, erreurs

## Requirements

- Nommer les tests de façon descriptive : `should [action] when [context]`
- Suivre la structure AAA : Arrange / Act / Assert
- Mocker les dépendances externes (Prisma, Supabase, cookies) — pas la logique métier
- Co-localiser les tests avec le code : `calculateScore.test.ts` à côté de `calculateScore.ts`
- Pour les tests E2E : tester les flows critiques MVP sur mobile (viewport 375px)
- Couvrir les cas edge du domaine métier : jokers déjà utilisés, session fermée, liste vide
- Tests indépendants — pas de dépendance à l'ordre d'exécution
