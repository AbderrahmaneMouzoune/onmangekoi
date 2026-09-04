import { RiForbid2Line, RiHeart3Fill, RiThumbDownLine, RiThumbUpLine } from '@remixicon/react'

import { cn } from '@/lib/utils'
import { formatScore } from '@/lib/vote'

import type { SessionResultRow } from '@/data-access/models'

interface ResultsListProps {
  results: SessionResultRow[]
  participantCount: number
}

export function ResultsList({ results, participantCount }: ResultsListProps) {
  const maxAbs = Math.max(1, ...results.map((r) => Math.abs(r.score)))
  const [winner, ...rest] = results

  if (!winner) return null

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="winner-title"
        className="flex flex-col gap-4 rounded-xl chalkboard p-6"
      >
        <p className="font-mono text-[0.7rem] tracking-[0.12em] text-chalk-muted uppercase">
          On mange chez
        </p>
        <h2
          id="winner-title"
          className="font-display text-[2.4rem] leading-[1.02] font-extrabold tracking-[-0.03em] text-chalk sm:text-5xl"
        >
          {winner.name}
        </h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-chalk-muted">
          {winner.cuisine_type && <span className="uppercase">{winner.cuisine_type}</span>}
          <span className="font-mono tabular">
            Score {formatScore(winner.score)} · {winner.votes_count}/{participantCount} votes
          </span>
        </div>
        <Breakdown row={winner} tone="chalk" />
        {results.filter((r) => r.rank === 1).length > 1 && (
          <p className="text-sm text-chalk-muted">
            Égalité parfaite avec{' '}
            {results
              .filter((r) => r.rank === 1 && r !== winner)
              .map((r) => r.name)
              .join(', ')}
            . À vous de trancher.
          </p>
        )}
      </section>

      {rest.length > 0 && (
        <section aria-label="Classement complet" className="flex flex-col gap-2">
          <h3 className="font-display text-base font-semibold">Le reste du classement</h3>
          <ol className="flex flex-col gap-2">
            {rest.map((row) => (
              <li
                key={row.session_restaurant_id}
                className="flex flex-col gap-2 rounded-lg bg-surface p-4 ring-1 ring-line"
              >
                <div className="flex items-center gap-3">
                  <span className="w-7 shrink-0 font-mono text-sm text-muted-foreground tabular">
                    {row.rank}.
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{row.name}</span>
                  <span
                    className={cn(
                      'font-mono text-sm font-semibold tabular',
                      row.score > 0 && 'text-yes',
                      row.score < 0 && 'text-veto',
                      row.score === 0 && 'text-muted-foreground'
                    )}
                  >
                    {formatScore(row.score)}
                  </span>
                </div>
                <ScoreBar score={row.score} maxAbs={maxAbs} />
                <Breakdown row={row} tone="ink" />
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}

function ScoreBar({ score, maxAbs }: { score: number; maxAbs: number }) {
  const ratio = Math.abs(score) / maxAbs
  return (
    <div aria-hidden="true" className="relative h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div
        className={cn(
          'absolute top-0 h-full rounded-full',
          score >= 0 ? 'left-1/2 bg-yes' : 'right-1/2 bg-veto'
        )}
        style={{ width: `${ratio * 50}%` }}
      />
      <div className="absolute top-0 left-1/2 h-full w-px bg-line-strong" />
    </div>
  )
}

function Breakdown({ row, tone }: { row: SessionResultRow; tone: 'chalk' | 'ink' }) {
  const items = [
    { icon: RiHeart3Fill, count: row.superlikes, label: 'coups de cœur', color: 'text-fav' },
    { icon: RiThumbUpLine, count: row.likes, label: 'ça me va', color: 'text-yes' },
    {
      icon: RiThumbDownLine,
      count: row.dislikes,
      label: 'bof',
      color: tone === 'chalk' ? 'text-chalk-muted' : 'text-no',
    },
    { icon: RiForbid2Line, count: row.super_dislikes, label: 'vetos', color: 'text-veto' },
  ]
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Détail des votes">
      {items.map((item) => (
        <li
          key={item.label}
          className={cn(
            'inline-flex items-center gap-1 font-mono text-xs tabular',
            tone === 'chalk' ? 'text-chalk-muted' : 'text-muted-foreground',
            item.count === 0 && 'opacity-50'
          )}
        >
          <item.icon aria-hidden="true" className={cn('size-3.5', item.count > 0 && item.color)} />
          {item.count}
          <span className="sr-only"> {item.label}</span>
        </li>
      ))}
    </ul>
  )
}
