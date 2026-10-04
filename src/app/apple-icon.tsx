import { ImageResponse } from 'next/og'

import { AppIcon } from '@/components/og/app-icon'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

/** iOS arrondit lui-même les coins : l'icône est un carré plein. */
export default function AppleIcon() {
  return new ImageResponse(<AppIcon size={size.width} />, size)
}
