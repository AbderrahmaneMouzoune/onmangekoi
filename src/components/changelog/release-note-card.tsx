import { RiCheckDoubleLine, RiSparkling2Line, RiToolsLine } from '@remixicon/react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'
import { CHANGELOG_LOCALE } from '@/content/changelog'
import { REPO_URL } from '@/lib/brand'
import { cn } from '@/lib/utils'

import type { ChangeKind, ReleaseNote } from '@/content/changelog'
import type { RemixiconComponentType } from '@remixicon/react'

/** Comment chaque nature de changement se présente à l'écran ; le libellé vient de `changelog.kinds`. */
const KINDS: Record<ChangeKind, { icon: RemixiconComponentType; className: string }> = {
  new: { icon: RiSparkling2Line, className: 'bg-brand-soft text-brand-hover' },
  improved: { icon: RiToolsLine, className: 'bg-surface-2 text-ink-2' },
  fixed: { icon: RiCheckDoubleLine, className: 'bg-yes-soft text-yes' },
}

/** « 29 septembre 2026 », « 29 September 2026 » : la date d'une version en toutes lettres. */
const RELEASE_DATE = { day: 'numeric', month: 'long', year: 'numeric' } as const

/**
 * Une version, telle qu'on la raconte aux utilisateurs : un nom, une phrase,
 * puis la liste de ce qui change. Le numéro de version renvoie à la release
 * GitHub, pour qui veut le détail technique — il n'est pas le sujet.
 *
 * Le contenu des notes est éditorial et rédigé en français
 * (`src/content/changelog`) : l'article porte `lang="fr"` pour qu'un lecteur
 * d'écran le prononce comme tel, même sur une page anglaise. Le reste — la
 * date, la nature de chaque changement — suit la langue de la page.
 */
export function ReleaseNoteCard({ note }: { note: ReleaseNote }) {
  const t = useTranslations('changelog')
  const format = useFormatter()
  const locale = useLocale()
  return (
    <article
      id={`v${note.version}`}
      lang={CHANGELOG_LOCALE}
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
              {versionTag(note.version)}
            </Badge>
          </a>
          <time dateTime={note.date} lang={locale} className="text-xs text-muted-foreground">
            {format.dateTime(new Date(`${note.date}T12:00:00Z`), RELEASE_DATE)}
          </time>
        </div>
        <h2 className="font-display text-lg font-bold sm:text-xl">{note.title}</h2>
        <p className="text-sm text-muted-foreground">{note.summary}</p>
      </header>

      <ul className="flex flex-col gap-3.5">
        {note.changes.map((change) => {
          const { icon: Icon, className } = KINDS[change.kind]
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
                  <span className="sr-only" lang={locale}>
                    {t('kindPrefix', { kind: t(`kinds.${change.kind}`) })}
                  </span>
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

/** `1.2.0` → `v1.2.0`, comme les tags de release : un identifiant, pas un mot. */
function versionTag(version: string): string {
  return `v${version}`
}
