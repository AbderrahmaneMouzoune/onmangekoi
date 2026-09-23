import { router } from '@/config/router.config'
import { absoluteUrl, siteUrl } from '@/lib/site'

import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl(), changeFrequency: 'monthly', priority: 1 },
    { url: absoluteUrl(router.changelog()), changeFrequency: 'monthly', priority: 0.5 },
    { url: absoluteUrl(router.privacy()), changeFrequency: 'yearly', priority: 0.3 },
  ]
}
