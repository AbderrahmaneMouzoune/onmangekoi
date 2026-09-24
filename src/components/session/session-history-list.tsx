import { RiTrophyLine } from '@remixicon/react'
import Link from 'next/link'

import { SessionStatusBadge } from '@/components/session/session-status-badge'
import { router } from '@/config/router.config'
import { formatScore } from '@/domain/vote'
import { countLabel, relativeDate } from '@/lib/format'

import type { SessionHistoryEntry } from '@/data-access/models'

/**
 * Les lignes de l'historique, sans aucune lecture : une session close mène à
 * son classement — c'est tout l'intérêt de la garder —, une session vivante à
 * sa salle. Le gagnant n'apparaît qu'une fois la session close : avant, il
 * n'existe pas.
 */
export function SessionHistoryList({ entries }: { entries: SessionHistoryEntry[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {entries.map((entry) => (
        <li key={entry.id}>
          <Link
            href={entry.status === 'closed' ? router.sessionResults(entry) : router.session(entry)}
            className="flex items-center justify-between gap-3 rounded-lg bg-surface p-4 ring-1 ring-line transition-colors hover:bg-surface-2"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate font-semibold">{entry.name}</span>
              <span className="text-xs text-muted-foreground">
                {relativeDate(entry.created_at)} ·{' '}
                {countLabel(entry.participant_count, 'participant')}
                {entry.is_host && ' · organisée par toi'}
              </span>
              {entry.winner_name && (
                <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
                  <RiTrophyLine aria-hidden="true" className="size-3.5 shrink-0 text-brand" />
                  <span className="truncate">{entry.winner_name}</span>
                  {entry.winner_score !== null && (
                    <span className="shrink-0 font-mono text-muted-foreground tabular">
                      {formatScore(entry.winner_score)}
                    </span>
                  )}
                </span>
              )}
            </div>
            <SessionStatusBadge status={entry.status} />
          </Link>
        </li>
      ))}
    </ul>
  )
}
