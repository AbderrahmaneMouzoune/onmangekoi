import { ImageResponse } from 'next/og'

import { AppIcon } from '@/components/og/app-icon'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

/** Icône : une ardoise sombre, un « k » à la craie, un point tomate. */
export default function Icon() {
  return new ImageResponse(<AppIcon size={size.width} rounded />, size)
}
