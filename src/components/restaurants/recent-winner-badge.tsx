import { recentWinLabel } from '@/domain/recent-winners'
import { cn } from '@/lib/utils'

interface RecentWinnerBadgeProps {
  /** Date du dernier sacre de ce restaurant. */
  wonAt: string
  /** L'anti-fatigue est actif : la ligne est écartée de la session. */
  excluded: boolean
}

/**
 * Le témoin d'anti-fatigue d'une ligne de résultat, le même dans le carnet et
 * chez Google. Doré tant qu'il ne fait qu'avertir — « Gagnant il y a 6 jours »
 * —, gris une fois la case cochée : la ligne est alors écartée, et le badge
 * dit ce qui lui arrive plutôt que ce qu'elle a fait.
 */
export function RecentWinnerBadge({ wonAt, excluded }: RecentWinnerBadgeProps) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 font-medium',
        excluded ? 'bg-surface-2 text-ink-muted' : 'bg-fav-soft text-fav'
      )}
    >
      {excluded ? 'Écarté' : recentWinLabel(wonAt)}
    </span>
  )
}
