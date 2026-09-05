/** @type {import('next').NextConfig} */
const nextConfig = {
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
