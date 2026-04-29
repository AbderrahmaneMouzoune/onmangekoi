---
applyTo: '**/*.tsx,**/*.ts,**/*.test.ts,**/*.test.tsx,**/*.spec.ts,**/*.spec.tsx'
description: 'Standards de tests pour onmangekoi — Jest, React Testing Library, Playwright'
---

# Tests — Standards et bonnes pratiques

Applique les conventions globales de `../copilot-instructions.md` à tout le code.

## Stratégie de test

- **Tests unitaires** : logique métier pure dans `lib/utils/`, calcul des scores, helpers
- **Tests d'intégration** : Server Actions, Route Handlers, interactions avec Supabase
- **Tests E2E** : flows critiques complets (créer une liste, lancer une session, voter, voir les résultats)

## Principes généraux

- Noms de tests descriptifs au format `should [action] when [context]`
- Structure claire AAA : Arrange / Act / Assert (ou Given / When / Then)
- Tests indépendants — pas de dépendance entre tests ni d'état partagé mutable
- Mocker les dépendances externes (DB, Supabase, cookies) — pas la logique métier

## Tests unitaires (Jest)

- Co-localiser les tests avec le code testé : `calculateScore.test.ts` à côté de `calculateScore.ts`
- Couvrir les cas limites : valeurs nulles, listes vides, jokers utilisés
- Tester les fonctions pures en priorité — facilement testables sans mocks

## Tests de composants (React Testing Library)

- Tester le comportement observable, pas l'implémentation interne
- Utiliser les requêtes sémantiques (`getByRole`, `getByText`) plutôt que `getByTestId`
- Vérifier l'accessibilité de base dans les tests (ARIA labels, rôles)

## Tests E2E (Playwright)

- Couvrir les flows critiques MVP : identité anonyme, création de liste, session de vote, classement final
- Tester sur mobile (viewport 375px) — app mobile-first
- Utiliser des fixtures pour les données de test — pas de dépendance à la prod

## Ce qu'on ne teste pas

- Les détails d'implémentation internes des composants
- Le code généré par shadcn/ui
- Les styles CSS / Tailwind
