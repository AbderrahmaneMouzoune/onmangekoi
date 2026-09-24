import { RiForbid2Line, RiHeart3Fill, RiThumbDownLine, RiThumbUpLine } from '@remixicon/react'

import { jokerBadge } from '@/domain/session-rules'
import { VOTE_ACTIONS, type VoteKind, type VoteValue } from '@/domain/vote'
import { cn } from '@/lib/utils'

import type { JokerKind, JokerQuotas } from '@/domain/session-rules'

interface VoteControlsProps {
  onVote: (value: VoteValue) => void
  disabled?: boolean
  /** Ce que les règles de la session accordent, et ce qu'il en reste */
  jokers: JokerQuotas
  /** Affiche la touche principale de chaque action (clavier physique, grand écran). */
  showShortcuts?: boolean
}

/** Les deux actions à quota — les deux autres sont illimitées. */
function jokerKind(kind: VoteKind): JokerKind | null {
  return kind === 'fav' || kind === 'veto' ? kind : null
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
  jokers,
  showShortcuts = false,
}: VoteControlsProps) {
  return (
    <div role="group" aria-label="Voter" className="grid grid-cols-4 gap-2 lg:grid-cols-2 lg:gap-3">
      {VOTE_ACTIONS.map((action) => {
        const Icon = ICONS[action.kind]
        const kind = jokerKind(action.kind)
        const quota = kind ? jokers[kind] : null
        const badge = quota ? jokerBadge(quota) : null
        const isDisabled = disabled || (quota !== null && quota.remaining === 0)
        return (
          <button
            key={action.kind}
            type="button"
            onClick={() => onVote(action.value)}
            disabled={isDisabled}
            title={badge ? `${action.hint} ${badge}` : action.hint}
            aria-label={
              badge
                ? `${action.label} — ${action.hint} ${badge}`
                : `${action.label} — ${action.hint}`
            }
            aria-keyshortcuts={action.shortcuts.join(' ')}
            className={cn(
              'relative flex flex-col items-center justify-center gap-1.5 rounded-lg py-3 text-xs font-semibold transition-[background-color,color,transform] outline-none focus-visible:ring-3 active:not-disabled:scale-95 disabled:cursor-not-allowed disabled:opacity-35 lg:min-h-28 lg:text-sm',
              action.joker ? 'min-h-20' : 'min-h-24',
              STYLES[action.kind]
            )}
          >
            <Icon aria-hidden="true" className={action.joker ? 'size-6' : 'size-7'} />
            <span>{action.short}</span>
            {badge && (
              // Pas d'opacité ici : à 70 % le libellé retombe à 2,7:1 sur son fond.
              <span className="font-mono text-[0.6rem] tracking-wide">{badge}</span>
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
