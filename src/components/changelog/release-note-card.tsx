import { RiCheckDoubleLine, RiSparkling2Line, RiToolsLine } from '@remixicon/react'

import { Badge } from '@/components/ui/badge'
import { REPO_URL } from '@/lib/brand'
import { cn } from '@/lib/utils'

import type { ChangeKind, ReleaseNote } from '@/content/changelog'
import type { RemixiconComponentType } from '@remixicon/react'

/** Comment chaque nature de changement se présente à l'écran. */
const KINDS: Record<
  ChangeKind,
  { label: string; icon: RemixiconComponentType; className: string }
> = {
  new: { label: 'Nouveau', icon: RiSparkling2Line, className: 'bg-brand-soft text-brand-hover' },
  improved: { label: 'Amélioré', icon: RiToolsLine, className: 'bg-surface-2 text-ink-2' },
  fixed: { label: 'Corrigé', icon: RiCheckDoubleLine, className: 'bg-yes-soft text-yes' },
}

const dateFormatter = new Intl.DateTimeFormat('fr', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/**
 * Une version, telle qu'on la raconte aux utilisateurs : un nom, une phrase,
 * puis la liste de ce qui change. Le numéro de version renvoie à la release
 * GitHub, pour qui veut le détail technique — il n'est pas le sujet.
 */
export function ReleaseNoteCard({ note }: { note: ReleaseNote }) {
  return (
    <article
      id={`v${note.version}`}
      className="flex scroll-mt-20 flex-col gap-4 rounded-lg bg-surface p-4 ring-1 ring-line sm:p-5"
    >
      <header className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <a
            href={`${REPO_URL}/releases/tag/v${note.version}`}
            target="_blank"
            rel="noreferrer noopener"
            className="rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            <Badge variant="outline" className="font-mono">
              v{note.version}
            </Badge>
          </a>
          <time dateTime={note.date} className="text-xs text-muted-foreground">
            {dateFormatter.format(new Date(`${note.date}T00:00:00Z`))}
          </time>
        </div>
        <h2 className="font-display text-lg font-bold sm:text-xl">{note.title}</h2>
        <p className="text-sm text-muted-foreground">{note.summary}</p>
      </header>

      <ul className="flex flex-col gap-3.5">
        {note.changes.map((change) => {
          const { label, icon: Icon, className } = KINDS[change.kind]
          return (
            <li key={change.title} className="flex gap-3">
              <span
                aria-hidden="true"
                className={cn(
                  'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full',
                  className
                )}
              >
                <Icon className="size-4" />
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="text-sm font-semibold">
                  <span className="sr-only">{label} : </span>
                  {change.title}
                </p>
                <p className="text-sm text-ink-2">{change.description}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </article>
  )
}
