# onmangekoi — Copilot Instructions

## Project Overview

**onmangekoi** est une web app mobile-first qui permet à des groupes (collègues, amis) de décider où manger via un système de vote style Tinder — sans friction d'inscription.

Le principe : créer une liste de restaurants favoris, lancer une session, partager un lien, voter sur chaque restaurant (dislike / like / superlike / super dislike), et afficher le classement final.

**Principe fondamental** : zéro friction. Tout est utilisable sans créer de compte — un simple pseudo (persisté en cookie) suffit.

## Tech Stack

| Couche          | Choix                                                            |
| --------------- | ---------------------------------------------------------------- |
| Frontend        | Next.js (App Router) + React + TypeScript                        |
| Styling         | Tailwind CSS + shadcn/ui                                         |
| Backend         | Next.js API Routes + Server Actions                              |
| Base de données | Supabase (PostgreSQL géré)                                       |
| Temps réel      | Supabase Realtime                                                |
| Auth            | Sessions anonymes via cookie + compte optionnel (email/password) |
| Déploiement     | Vercel + Supabase                                                |

## Conventions

### Naming

- **Fichiers composants** : `kebab-case` (ex : `vote-card.tsx`)
- **Hooks** : `kebab-case` avec préfixe `use` (ex : `use-session.ts`)
- **Utilitaires / actions** : `camelCase` (ex : `calculateScore.ts`)
- **Dossiers** : `kebab-case` (ex : `vote-session/`)
- **Types/Interfaces** : `PascalCase` (ex : `SessionStatus`)
- **Constantes** : `UPPER_SNAKE_CASE`

### Structure

```
app/
  (auth)/        # Routes d'auth optionnelle
  (app)/         # Routes principales
    lists/
    sessions/
    vote/
  api/           # Route Handlers
components/
  ui/            # Composants shadcn/ui
  [feature]/     # Composants par fonctionnalité
lib/
  actions/       # Server Actions
  db/            # Supabase client et queries
  utils/         # Utilitaires partagés
hooks/           # Custom hooks
types/           # TypeScript types globaux
```

### Error Handling

- Valider toutes les entrées côté serveur avec Zod
- Utiliser les Server Actions pour les mutations avec gestion d'erreur typée
- Les erreurs clients sont centralisées via error boundaries
- Ne jamais exposer les stack traces en production

## Workflow

- **Branches** : `type/description-courte` (ex : `feat/vote-interface`, `fix/session-close`)
- **Commits** : Conventional Commits — `feat:`, `fix:`, `chore:`, `refactor:`
- **PRs** : Description claire + checklist sécurité/perf avant merge

## Instructions spécialisées

- TypeScript / Next.js : `.github/instructions/typescript-nextjs.instructions.md`
- Tests : `.github/instructions/testing.instructions.md`
- Sécurité : `.github/instructions/security.instructions.md`
- Performance : `.github/instructions/performance.instructions.md`
- Documentation : `.github/instructions/documentation.instructions.md`
- Code review : `.github/instructions/code-review.instructions.md`
