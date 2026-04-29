---
applyTo: '**/*.tsx,**/*.ts,**/*.md'
description: 'Standards de documentation pour onmangekoi'
---

# Documentation — Standards et bonnes pratiques

Applique les conventions globales de `../copilot-instructions.md` à tout le code.

## Principes

- Le code se documente lui-même via des noms clairs — les commentaires expliquent le **pourquoi**, pas le **quoi**
- Pas de commentaires redondants qui répètent ce que le code dit déjà
- Documenter les décisions non évidentes, les contraintes métier ou les cas edge importants

## Fonctions et hooks publics

- Documenter les fonctions complexes dans `lib/` avec un commentaire bref expliquant le but et les paramètres non triviaux
- Les hooks custom (`useVoteSession`, `useScore`) méritent un commentaire sur leur comportement et leurs pré-conditions
- Les Server Actions exposées doivent indiquer leur pré-condition d'authentification si applicable

## Composants

- Les props complexes ou non-évidentes méritent un commentaire inline
- Pas de JSDoc exhaustif sur chaque composant — préférer des noms de props expressifs

## README & guides

- Tenir le `README.md` à jour avec les instructions de setup (variables d'env, commandes de démarrage)
- Documenter les choix d'architecture non triviaux dans un commentaire en tête du fichier concerné
- Les migrations Prisma importantes méritent un commentaire dans le fichier de migration

## Types

- Les types/interfaces complexes bénéficient d'un commentaire expliquant leur rôle dans le domaine
- Utiliser des noms de types suffisamment descriptifs pour éviter les commentaires (`VoteScore`, `SessionStatus`, `ParticipantProgress`)
