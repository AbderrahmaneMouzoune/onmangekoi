import { RiGithubLine, RiRssLine } from '@remixicon/react'

import { ChangelogSeenMarker } from '@/components/changelog/changelog-seen-marker'
import { ReleaseNoteCard } from '@/components/changelog/release-note-card'
import { PageHeader } from '@/components/layout/page-header'
import { Shell } from '@/components/layout/shell'
import { EmptyState } from '@/components/ui/empty-state'
import { router } from '@/config/router.config'
import { getReleaseNotes } from '@/content/changelog'
import { REPO_URL, SITE_NAME } from '@/lib/brand'

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Nouveautés',
  description: `Ce qui a changé dans ${SITE_NAME}, version après version : ce qu'on peut faire de plus, ce qui a été amélioré, ce qui a été corrigé.`,
  alternates: {
    types: { 'application/rss+xml': router.changelogFeed() },
  },
}

/**
 * Journal des versions, côté produit.
 *
 * Rien ici ne dépend de qui regarde : la page est entièrement prérendue depuis
 * `src/content/changelog`. Seul le marqueur de lecture s'exécute dans le
 * navigateur, pour éteindre la pastille de l'en-tête.
 */
export default function ChangelogPage() {
  const notes = getReleaseNotes()
  const latest = notes[0]

  return (
    <Shell wide>
      {latest && <ChangelogSeenMarker version={latest.version} />}

      <PageHeader
        eyebrow="Journal des versions"
        title="Nouveautés"
        description={`Ce qui a changé dans ${SITE_NAME}, de la version la plus récente à la première.`}
        back={{ href: router.home(), label: 'Accueil' }}
      />

      {notes.length === 0 ? (
        <EmptyState
          title="Rien à annoncer pour l’instant"
          description="La première note de version arrivera ici dès la prochaine mise en ligne."
        />
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
          Suivre en RSS
        </a>
        <a
          href={`${REPO_URL}/releases`}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 font-medium hover:text-ink"
        >
          <RiGithubLine aria-hidden="true" className="size-4" />
          Détail technique des releases
        </a>
      </footer>
    </Shell>
  )
}
