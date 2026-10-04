import { RiGithubLine, RiRssLine } from '@remixicon/react'
import { useLocale, useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'

import { ChangelogSeenMarker } from '@/components/changelog/changelog-seen-marker'
import { ReleaseNoteCard } from '@/components/changelog/release-note-card'
import { PageHeader } from '@/components/layout/page-header'
import { Shell } from '@/components/layout/shell'
import { EmptyState } from '@/components/ui/empty-state'
import { router } from '@/config/router.config'
import { CHANGELOG_LOCALE, getReleaseNotes } from '@/content/changelog'
import { REPO_URL, SITE_NAME } from '@/lib/brand'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const [tTitles, t] = await Promise.all([
    getTranslations('metadata.titles'),
    getTranslations('metadata.changelog'),
  ])
  return {
    title: tTitles('changelog'),
    description: t('description', { site: SITE_NAME }),
    alternates: {
      types: { 'application/rss+xml': router.changelogFeed() },
    },
  }
}

/**
 * Journal des versions, côté produit.
 *
 * Rien ici ne dépend de qui regarde : la page est entièrement prérendue depuis
 * `src/content/changelog`. Seul le marqueur de lecture s'exécute dans le
 * navigateur, pour éteindre la pastille de l'en-tête.
 *
 * Le chrome de la page se traduit ; les notes, elles, restent en français
 * (`CHANGELOG_LOCALE`) — une phrase le signale à qui lit dans une autre langue.
 */
export default function ChangelogPage() {
  const t = useTranslations('changelog')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const notes = getReleaseNotes()
  const latest = notes[0]

  return (
    <Shell size="reading">
      {latest && <ChangelogSeenMarker version={latest.version} />}

      <PageHeader
        eyebrow={t('page.eyebrow')}
        title={t('page.title')}
        description={t('page.description', { site: SITE_NAME })}
        back={{ href: router.home(), label: tCommon('actions.home') }}
      />

      {locale !== CHANGELOG_LOCALE && notes.length > 0 && (
        <p className="text-sm text-muted-foreground">{t('page.contentLanguage')}</p>
      )}

      {notes.length === 0 ? (
        <EmptyState title={t('empty.title')} description={t('empty.description')} />
      ) : (
        <ol className="flex flex-col gap-4">
          {notes.map((note) => (
            <li key={note.version}>
              <ReleaseNoteCard note={note} />
            </li>
          ))}
        </ol>
      )}

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <a
          href={router.changelogFeed()}
          className="inline-flex items-center gap-1.5 font-medium hover:text-ink"
        >
          <RiRssLine aria-hidden="true" className="size-4" />
          {t('rss')}
        </a>
        <a
          href={`${REPO_URL}/releases`}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 font-medium hover:text-ink"
        >
          <RiGithubLine aria-hidden="true" className="size-4" />
          {t('releases')}
        </a>
      </footer>
    </Shell>
  )
}
