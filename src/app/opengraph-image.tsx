import { ImageResponse } from 'next/og'

import { OgCard } from '@/components/og/og-card'
import { SITE_TAGLINE } from '@/lib/site'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = `onmangekoi — ${SITE_TAGLINE}`

export default function OpenGraphImage() {
  return new ImageResponse(
    <OgCard
      eyebrow="Vote de groupe"
      title="Où est-ce qu’on mange ?"
      subtitle="Le groupe vote, le classement tranche. Sans compte."
      footer="2 minutes, promis"
    />,
    size
  )
}
