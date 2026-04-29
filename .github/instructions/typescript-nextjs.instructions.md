---

applyTo: "**/\*.tsx,**/_.ts,\*\*/_.jsx,**/\*.js,**/\*.css"
description: "TypeScript et Next.js (App Router) — standards de développement pour onmangekoi"

---

# TypeScript / Next.js — Standards de développement

Applique les conventions globales de `../copilot-instructions.md` à tout le code.

## TypeScript

- Active le mode strict dans `tsconfig.json` — jamais de contournement avec `any`
- Utilise des interfaces `PascalCase` pour les props et les types de données
- Préfère l'inférence de type quand elle est claire ; annote explicitement les valeurs de retour des fonctions publiques
- Valide toutes les entrées externes avec Zod aux boundaries système

## App Router & Composants

- Utilise le App Router (`app/`) pour toutes les routes — jamais le `pages/` legacy
- Les composants sont Server Components par défaut ; ajoute `'use client'` uniquement pour les hooks, les événements ou les APIs navigateur
- Pousse `'use client'` le plus bas possible dans l'arbre (composants feuilles)
- Marque explicitement les Server Actions avec `'use server'`
- Groupe les routes avec `(group)/` sans impacter les URLs ; préfixe les dossiers privés avec `_`

## Data Fetching & Caching

- Fetch les données dans les Server Components directement (async/await) — pas de `useEffect` + `fetch` dans le App Router
- Ne pas appeler ses propres Route Handlers depuis les Server Components ; factoriser la logique dans `lib/`
- Utilise Suspense + `loading.tsx` pour les états de chargement ; `error.tsx` pour les error boundaries par segment
- Les `params` et `searchParams` dans les Server Components sont asynchrones — toujours les `await`

## Tailwind CSS & shadcn/ui

- Utilise Tailwind CSS pour tout le styling — pas de CSS-in-JS ni de styles inline
- Compose les classes Tailwind avec `cn()` (utilitaire `lib/utils.ts`) pour la lisibilité conditionnelle
- Réutilise les composants shadcn/ui — n'en crée pas de personnalisés si un équivalent existe
- Mobile-first : pense d'abord aux petits écrans, utilise les breakpoints `sm:`, `md:`, `lg:`

## Supabase & Base de données

- Toutes les requêtes Supabase vivent dans `lib/db/` — jamais directement dans les composants ou les Route Handlers
- Utilise toujours le client Supabase côté serveur (`createServerClient`) dans les Server Actions et Route Handlers — jamais le client browser pour des opérations sensibles
- Gère les erreurs Supabase explicitement (`error` retourné par le client) ; ne laisse pas les erreurs de DB remonter brutes au client

## Server Actions

- Valide tous les inputs avec Zod avant toute logique métier
- Vérifie l'authentification/autorisation en premier dans chaque action sensible
- Retourne des erreurs typées (`{ error: string }` ou `{ data: T }`) — pas d'exceptions non gérées
- Utilise `revalidatePath` / `revalidateTag` après les mutations pour invalider le cache

## API Routes (Route Handlers)

- Place les routes dans `app/api/[resource]/route.ts`
- Exporte des fonctions nommées par verbe HTTP (`GET`, `POST`, `PATCH`, `DELETE`)
- Retourne toujours des `NextResponse` avec des status codes HTTP appropriés
- Protège les routes sensibles avec une vérification de session/cookie dès le début du handler
