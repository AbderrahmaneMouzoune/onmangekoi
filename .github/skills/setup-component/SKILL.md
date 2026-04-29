---
name: setup-component
description: Crée un nouveau composant React/Next.js pour onmangekoi en suivant les conventions du projet
---

# Setup Component

Crée un nouveau composant React pour onmangekoi en respectant les conventions établies du projet. Demande le nom et le type de composant si non fournis.

Demande les informations suivantes si non précisées :

- **Nom du composant** (PascalCase)
- **Type** : Server Component, Client Component, ou les deux
- **Feature** : dans quel dossier `components/[feature]/` le placer
- **Props** nécessaires

## Requirements

- Suivre la convention de nommage du projet : `kebab-case` pour les fichiers et exports
- Ajouter `'use client'` uniquement si le composant a besoin d'interactivité, de hooks ou d'APIs navigateur
- Utiliser Tailwind CSS pour le styling — pas de CSS-in-JS
- Réutiliser les composants shadcn/ui disponibles dans `components/ui/`
- Typer les props avec une interface TypeScript `PascalCase`
- Placer les composants partagés dans `components/[feature]/` et les composants locaux à côté de leur route
- Mobile-first : concevoir d'abord pour les petits écrans
