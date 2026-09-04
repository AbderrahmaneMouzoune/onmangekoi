import { SITE_NAME, SITE_TAGLINE } from '@/lib/site'

import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_TAGLINE,
    start_url: '/',
    display: 'standalone',
    lang: 'fr',
    background_color: '#f4f3ee',
    theme_color: '#e8412c',
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  }
}
