/**
 * Images distantes : un seul endroit décide des hôtes de confiance.
 *
 * `next/image` refuse — à l'exécution — toute URL dont l'hôte n'est pas déclaré
 * dans `next.config.mjs`. Une photo importée depuis une source tierce pourrait
 * donc casser une page entière : on filtre en amont et on retombe proprement
 * sur le rendu sans image. La liste ci-dessous doit rester synchronisée avec
 * `images.remotePatterns` (vérifié par `images.test.ts`).
 */
export const ALLOWED_IMAGE_HOSTS = [
  /** Photos servies par Google Places (import à venir) */
  'lh3.googleusercontent.com',
  'places.googleapis.com',
  /** Tuiles de la mini-carte statique */
  'tile.openstreetmap.org',
] as const

const hosts: readonly string[] = ALLOWED_IMAGE_HOSTS

/** Renvoie l'URL si elle est en HTTPS sur un hôte autorisé, `null` sinon. */
export function remoteImageUrl(url: string | null | undefined): string | null {
  if (!url) return null
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:') return null
  return hosts.includes(parsed.hostname) ? url : null
}
