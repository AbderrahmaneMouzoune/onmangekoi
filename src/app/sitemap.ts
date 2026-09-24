import { router } from '@/config/router.config'
import { getPublicListEntries } from '@/data-access/public-lists'
import { absoluteUrl, siteUrl } from '@/lib/site'

import type { MetadataRoute } from 'next'

/**
 * Les trois pages du produit, et les listes que leurs propriétaires ont
 * rendues publiques : une liste de restos est le seul objet du site qu'on
 * recommande spontanément, c'est donc elle qui mérite d'être trouvée.
 *
 * Les listes privées n'en sont pas (la RPC ne les rend pas), et la remise en
 * privé les en sort à la revalidation suivante — l'action purge le tag. Une
 * base injoignable ne fait pas tomber le sitemap : il reste celui des pages
 * fixes.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lists = await getPublicListEntries().catch(() => [])

  return [
    { url: siteUrl(), changeFrequency: 'monthly', priority: 1 },
    { url: absoluteUrl(router.changelog()), changeFrequency: 'monthly', priority: 0.5 },
    { url: absoluteUrl(router.privacy()), changeFrequency: 'yearly', priority: 0.3 },
    ...lists.map((list) => ({
      url: absoluteUrl(router.sharedList(list)),
      lastModified: new Date(list.updated_at),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
  ]
}
