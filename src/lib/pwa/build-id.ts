/**
 * Identifiant du build courant, calculé dans `next.config.mjs` et injecté au
 * build (`env.NEXT_PUBLIC_BUILD_ID`). `dev` hors build : tests, `next dev`.
 */
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev'
