import { siteUrl } from '@/lib/site'

import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/'],
        disallow: ['/sessions/', '/lists/', '/account', '/auth/', '/setup', '/login'],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  }
}
