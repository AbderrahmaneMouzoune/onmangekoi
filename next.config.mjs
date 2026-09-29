import { randomUUID } from 'node:crypto'

/**
 * Identifiant du build, partagé par Next (`generateBuildId`) et le service
 * worker (`/sw.js`), qui en fait le nom de ses caches : chaque déploiement
 * change le script du service worker, le navigateur installe la nouvelle
 * version et celle-ci efface les caches de l'ancienne (voir
 * `src/lib/pwa/service-worker.ts`).
 *
 * Sur Vercel, l'identifiant du déploiement — un redéploiement du même commit
 * avec d'autres variables doit, lui aussi, repartir d'un cache propre. Ailleurs,
 * le commit s'il est connu, sinon un identifiant aléatoire par build.
 *
 * Next évalue ce fichier dans plusieurs processus (compilation, workers de
 * prérendu) : l'identifiant est retenu dans `OMK_BUILD_ID`, dont les workers
 * héritent, pour que tous s'accordent sur la même valeur.
 */
const BUILD_ID = (process.env.OMK_BUILD_ID ||=
  process.env.VERCEL_DEPLOYMENT_ID ??
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ??
  randomUUID().slice(0, 8))

/** @type {import('next').NextConfig} */
const nextConfig = {
  generateBuildId: () => BUILD_ID,
  env: {
    NEXT_PUBLIC_BUILD_ID: BUILD_ID,
  },
  turbopack: {
    root: import.meta.dirname,
  },
  /**
   * Cache Components (PPR + `use cache`) : chaque route est prérendue sous
   * forme de coquille statique servie depuis le cache, et seules les parties
   * réellement personnalisées (utilisateur, session, listes) sont diffusées en
   * streaming dans leurs `<Suspense>`. Le catalogue de restaurants, identique
   * pour tout le monde, est mis en cache via `use cache` (voir
   * `data-access/restaurants.ts`).
   */
  cacheComponents: true,
  images: {
    // Doit rester synchronisé avec `ALLOWED_IMAGE_HOSTS` (src/lib/images.ts),
    // d'où les URL sont filtrées avant d'atteindre `next/image`.
    // La cohérence des deux listes est vérifiée par src/lib/images.test.ts.
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'places.googleapis.com' },
      { protocol: 'https', hostname: 'tile.openstreetmap.org' },
    ],
  },
}

export default nextConfig
