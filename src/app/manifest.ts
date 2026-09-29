import { router } from '@/config/router.config'
import { SITE_NAME, SITE_TAGLINE } from '@/lib/brand'
import { PWA_ICONS } from '@/lib/pwa/icons'

import type { MetadataRoute } from 'next'

/**
 * Manifest de l'app installable (issue #11). `id` fige l'identité de l'app
 * installée : le changer ferait d'une mise à jour une autre application aux
 * yeux du navigateur.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: router.home(),
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_TAGLINE,
    start_url: router.home(),
    scope: router.home(),
    display: 'standalone',
    lang: 'fr',
    dir: 'ltr',
    categories: ['food', 'lifestyle', 'social'],
    background_color: '#f4f3ee',
    theme_color: '#e8412c',
    prefer_related_applications: false,
    icons: PWA_ICONS.map((icon) => ({
      src: icon.src,
      sizes: `${icon.size}x${icon.size}`,
      type: 'image/png',
      purpose: icon.purpose,
    })),
  }
}
