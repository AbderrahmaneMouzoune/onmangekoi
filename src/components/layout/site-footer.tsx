import Link from 'next/link'

import { router } from '@/config/router.config'
import { REPO_URL, SITE_NAME } from '@/lib/brand'

/**
 * Pied de page minimal. Sa raison d'être : rendre la politique de
 * confidentialité atteignable depuis n'importe quelle page, comme l'exige le
 * RGPD.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <nav
        aria-label="Liens de bas de page"
        className="mx-auto flex w-full max-w-lg flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-5 text-xs text-muted-foreground"
      >
        <span>{SITE_NAME}</span>
        <span className="flex items-center gap-4">
          <Link href={router.privacy()} className="font-medium hover:text-ink">
            Confidentialité
          </Link>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium hover:text-ink"
          >
            Code source
          </a>
        </span>
      </nav>
    </footer>
  )
}
