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
}

export default nextConfig
