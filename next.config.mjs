/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: import.meta.dirname,
  },
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
