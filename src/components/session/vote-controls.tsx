import { RiForbid2Line, RiHeart3Fill, RiThumbDownLine, RiThumbUpLine } from '@remixicon/react'

import { cn } from '@/lib/utils'
import { VOTE_ACTIONS, type VoteKind, type VoteValue } from '@/lib/vote'

interface VoteControlsProps {
  onVote: (value: VoteValue) => void
  disabled?: boolean
  superlikeUsed: boolean
  superDislikeUsed: boolean
}

const ICONS: Record<VoteKind, typeof RiThumbUpLine> = {
  veto: RiForbid2Line,
  no: RiThumbDownLine,
  yes: RiThumbUpLine,
  fav: RiHeart3Fill,
}

const STYLES: Record<VoteKind, string> = {
  veto: 'bg-veto-soft text-veto hover:bg-veto hover:text-white focus-visible:ring-veto/40',
  no: 'bg-no-soft text-no hover:bg-no hover:text-white focus-visible:ring-no/40',
  yes: 'bg-yes-soft text-yes hover:bg-yes hover:text-white focus-visible:ring-yes/40',
  fav: 'bg-fav-soft text-fav hover:bg-fav hover:text-white focus-visible:ring-fav/40',
}

export function VoteControls({
  onVote,
  disabled = false,
  superlikeUsed,
  superDislikeUsed,
}: VoteControlsProps) {
  return (
    <div role="group" aria-label="Voter" className="grid grid-cols-4 gap-2">
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
            className={cn(
              'flex flex-col items-center justify-center gap-1.5 rounded-lg py-3 text-xs font-semibold transition-[background-color,color,transform] outline-none focus-visible:ring-3 active:not-disabled:scale-95 disabled:cursor-not-allowed disabled:opacity-35',
              action.joker ? 'min-h-20' : 'min-h-24',
              STYLES[action.kind]
            )}
          >
            <Icon aria-hidden="true" className={action.joker ? 'size-6' : 'size-7'} />
            <span>{action.short}</span>
            {action.joker && (
              <span className="font-mono text-[0.6rem] tracking-wide opacity-70">
                {jokerSpent ? 'utilisé' : '1 joker'}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
