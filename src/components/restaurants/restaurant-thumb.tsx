import { RiRestaurant2Line } from '@remixicon/react'
import Image from 'next/image'

import { initials } from '@/lib/format'
import { remoteImageUrl } from '@/lib/images'
import { cn } from '@/lib/utils'

const PALETTE = [
  'bg-brand-soft text-brand-hover',
  'bg-yes-soft text-yes',
  'bg-fav-soft text-fav',
  'bg-surface-2 text-ink-2',
  'bg-veto-soft text-veto',
] as const

/** Même resto, même teinte : le hash du nom choisit la couleur du repli. */
function paletteFor(name: string): string {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return PALETTE[hash % PALETTE.length]
}

const SIZES = {
  sm: { box: 'size-10 rounded-md text-sm', px: 40 },
  md: { box: 'size-14 rounded-lg text-base', px: 56 },
} as const

interface RestaurantThumbProps {
  name: string
  photoUrl?: string | null
  size?: keyof typeof SIZES
  className?: string
}

/**
 * Vignette d'un restaurant : sa photo quand on l'a (import Google), sinon une
 * tuile colorée à ses initiales. Décorative — le nom est toujours écrit à
 * côté — donc jamais annoncée aux lecteurs d'écran.
 */
export function RestaurantThumb({ name, photoUrl, size = 'md', className }: RestaurantThumbProps) {
  const photo = remoteImageUrl(photoUrl)
  const { box, px } = SIZES[size]

  if (photo) {
    return (
      <Image
        src={photo}
        alt=""
        width={px}
        height={px}
        loading="lazy"
        className={cn('shrink-0 object-cover ring-1 ring-line', box, className)}
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden font-display font-bold select-none',
        box,
        paletteFor(name),
        className
      )}
    >
      <RiRestaurant2Line className="absolute -right-1 -bottom-1 size-[60%] opacity-15" />
      {initials(name)}
    </span>
  )
}
