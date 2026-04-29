---

applyTo: "**/\*.tsx,**/_.ts,\*\*/_.jsx,**/\*.js,**/\*.css"
description: "Standards de performance web pour onmangekoi — Core Web Vitals, Next.js, mobile-first"

---

# Performance — Standards et bonnes pratiques

Applique les conventions globales de `../copilot-instructions.md` à tout le code.

## Priorités Core Web Vitals

- **LCP < 2.5s** : contenu principal visible rapidement
- **INP < 200ms** : interactions réactives
- **CLS < 0.1** : pas de décalages de layout inattendus

## Server vs Client Components

- Garder la logique lourde dans les Server Components — réduire le bundle client
- N'utiliser `'use client'` que lorsque c'est nécessaire (interactivité, hooks, browser APIs)
- Éviter de marquer des pages entières ou des layouts avec `'use client'`
- Fetch les données dans les Server Components directement — pas de `useEffect` + `fetch`

## Images & Médias

- Toujours utiliser `next/image` avec `width`, `height` et `alt` définis
- Ajouter `priority` sur les images above-the-fold (LCP)
- Ne jamais utiliser `loading="lazy"` sur les images hero
- Utiliser des formats modernes (WebP/AVIF) quand possible

## Fonts

- Utiliser `next/font/google` pour les Google Fonts — zero CLS, pas de requête externe
- Définir `font-display: swap` ou `optional` pour les fonts personnalisées

## Rendu & Interactions

- Utiliser `<Suspense>` avec des skeletons pour les données lentes — ne pas bloquer tout le rendu
- Utiliser `startTransition` / `useTransition` pour les mises à jour non urgentes
- Virtualiser les listes de plus de 100 éléments (TanStack Virtual)
- Nettoyer les event listeners et les timers dans `useEffect` (retour de cleanup)

## CSS & Animations

- Animer uniquement `transform` et `opacity` — pas les propriétés qui déclenchent le layout (`width`, `height`, `top`, `left`)
- Tailwind CSS inclut PurgeCSS — ne pas importer de styles non utilisés

## Bundle

- Privilégier les imports directs plutôt que les barrel files pour le tree-shaking
- Utiliser `React.lazy` / `dynamic()` pour les composants lourds non critiques
- Éviter les dépendances volumineuses pour de petits utilitaires (préférer les APIs natives)
