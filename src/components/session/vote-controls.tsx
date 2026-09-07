import { RiForbid2Line, RiHeart3Fill, RiThumbDownLine, RiThumbUpLine } from '@remixicon/react'

import { VOTE_ACTIONS, type VoteKind, type VoteValue } from '@/domain/vote'
import { cn } from '@/lib/utils'

interface VoteControlsProps {
  onVote: (value: VoteValue) => void
  disabled?: boolean
  superlikeUsed: boolean
  superDislikeUsed: boolean
  /** Affiche la touche principale de chaque action (clavier physique, grand écran). */
  showShortcuts?: boolean
}

const ICONS: Record<VoteKind, typeof RiThumbUpLine> = {
  veto: RiForbid2Line,
  no: RiThumbDownLine,
  yes: RiThumbUpLine,
  fav: RiHeart3Fill,
}

const STYLES: Record<VoteKind, string> = {
  veto: 'bg-veto-soft text-veto hover:bg-veto hover:text-surface focus-visible:ring-veto',
  no: 'bg-no-soft text-no hover:bg-no hover:text-surface focus-visible:ring-no',
  yes: 'bg-yes-soft text-yes hover:bg-yes hover:text-surface focus-visible:ring-yes',
  fav: 'bg-fav-soft text-fav hover:bg-fav hover:text-surface focus-visible:ring-fav',
}

export function VoteControls({
  onVote,
  disabled = false,
  superlikeUsed,
  superDislikeUsed,
  showShortcuts = false,
}: VoteControlsProps) {
  return (
    <div role="group" aria-label="Voter" className="grid grid-cols-4 gap-2 lg:grid-cols-2 lg:gap-3">
      {VOTE_ACTIONS.map((action) => {
        const Icon = ICONS[action.kind]
        const jokerSpent =
          (action.kind === 'fav' && superlikeUsed) || (action.kind === 'veto' && superDislikeUsed)
        const isDisabled = disabled || jokerSpent
        return (
          <button
            key={action.kind}
            type="button"
            onClick={() => onVote(action.value)}
            disabled={isDisabled}
            title={jokerSpent ? 'Joker déjà utilisé' : action.hint}
            aria-label={`${action.label} — ${action.hint}`}
            aria-keyshortcuts={action.shortcuts.join(' ')}
            className={cn(
              'relative flex flex-col items-center justify-center gap-1.5 rounded-lg py-3 text-xs font-semibold transition-[background-color,color,transform] outline-none focus-visible:ring-3 active:not-disabled:scale-95 disabled:cursor-not-allowed disabled:opacity-35 lg:min-h-28 lg:text-sm',
              action.joker ? 'min-h-20' : 'min-h-24',
              STYLES[action.kind]
            )}
          >
            <Icon aria-hidden="true" className={action.joker ? 'size-6' : 'size-7'} />
            <span>{action.short}</span>
            {action.joker && (
              // Pas d'opacité ici : à 70 % le libellé retombe à 2,7:1 sur son fond.
              <span className="font-mono text-[0.6rem] tracking-wide">
                {jokerSpent ? 'utilisé' : '1 joker'}
              </span>
            )}
            {showShortcuts && (
              <kbd
                aria-hidden="true"
                className="absolute top-2 right-2 hidden border-current/30 bg-transparent text-current lg:inline-flex"
              >
                {action.shortcuts[0]}
              </kbd>
            )}
          </button>
        )
      })}
    </div>
  )
}
