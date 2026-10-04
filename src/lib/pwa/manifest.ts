import { router } from '@/config/router.config'
import { SITE_NAME } from '@/lib/brand'
import { PWA_ICONS } from '@/lib/pwa/icons'

import type { Locale } from '@/i18n/config'
import type { MetadataRoute } from 'next'

/**
 * Manifest de l'app installable (issue #11), dans la langue demandée
 * (issue #14). `id` fige l'identité de l'app installée : le changer ferait
 * d'une mise à jour une autre application aux yeux du navigateur — il ne
 * dépend donc surtout pas de la langue.
 */
export function buildManifest({
  locale,
  description,
}: {
  locale: Locale
  description: string
}): MetadataRoute.Manifest {
  return {
    id: router.home(),
    name: SITE_NAME,
    short_name: SITE_NAME,
    description,
    start_url: router.home(),
    scope: router.home(),
    display: 'standalone',
    lang: locale,
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
