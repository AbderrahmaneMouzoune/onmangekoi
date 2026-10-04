import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'

const PALETTE = [
  'bg-brand-soft text-brand-hover',
  'bg-yes-soft text-yes',
  'bg-fav-soft text-fav',
  'bg-surface-2 text-ink-2',
  'bg-veto-soft text-veto',
  'bg-slate text-chalk',
] as const

/** Même personne, même couleur : le hash du pseudo choisit la teinte. */
function paletteFor(name: string): string {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return PALETTE[hash % PALETTE.length]
}

interface AvatarProps {
  name: string | null | undefined
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZES = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-14 text-lg',
} as const

/**
 * Pastille décorative (`aria-hidden`) : le nom lisible est toujours écrit à
 * côté. Sans pseudo, elle affiche « ? » — l'appelant passe de toute façon le
 * libellé de repli traduit (`common.people.guest`) quand il en a un.
 */
export function Avatar({ name, size = 'md', className }: AvatarProps) {
  const label = name?.trim() ?? ''
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold select-none',
        SIZES[size],
        paletteFor(label),
        className
      )}
    >
      {initials(label)}
    </span>
  )
}
