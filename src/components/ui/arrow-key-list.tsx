'use client'

import { useArrowNavigation, type ArrowOrientation } from '@/hooks/use-arrow-navigation'

type ListTag = 'ul' | 'ol' | 'div'

type ArrowKeyListProps<T extends ListTag> = React.ComponentPropsWithoutRef<T> & {
  as?: T
  /** `vertical` (↑ ↓) par défaut ; `both` pour une grille ou des pastilles qui passent à la ligne. */
  orientation?: ArrowOrientation
}

/**
 * Une liste qu'on parcourt aux flèches. Enveloppe client des `<ul>` rendus
 * par des composants serveur — sessions, listes, résultats — qui ne peuvent
 * pas poser de gestionnaire d'événement eux-mêmes.
 */
export function ArrowKeyList<T extends ListTag = 'ul'>({
  as,
  orientation = 'vertical',
  onKeyDown,
  ...props
}: ArrowKeyListProps<T>) {
  const Tag = (as ?? 'ul') as React.ElementType
  const navigate = useArrowNavigation(orientation)
  return (
    <Tag
      onKeyDown={(event: React.KeyboardEvent<HTMLElement>) => {
        onKeyDown?.(event as never)
        navigate(event)
      }}
      {...props}
    />
  )
}
