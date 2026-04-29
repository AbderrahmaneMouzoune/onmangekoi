---
name: refactor-code
description: Refactorise du code onmangekoi pour améliorer la lisibilité, réduire la duplication ou mieux suivre les conventions du projet
---

# Refactor Code

Refactorise le code fourni en appliquant les conventions et patterns du projet. Demande le fichier cible et l'objectif de refactoring si non précisés.

Demande les informations suivantes si non précisées :

- **Fichier ou extrait** à refactoriser
- **Objectif** : lisibilité, réduction de duplication, découpage en composants, meilleure utilisation de Server Components, etc.

## Requirements

- Ne pas changer le comportement observable — refactoring pur
- Suivre les conventions établies du projet (nommage, structure, patterns)
- Pousser `'use client'` le plus bas possible dans l'arbre si applicable
- Factoriser la logique dupliquée dans `lib/utils/` ou `lib/actions/`
- Améliorer la séparation Server Component / Client Component si pertinent
- Mettre à jour les types TypeScript si nécessaire
- Expliquer brièvement chaque changement significatif
