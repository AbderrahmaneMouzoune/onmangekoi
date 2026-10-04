import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { LocaleSwitcher } from '@/components/layout/locale-switcher'
import { router } from '@/config/router.config'
import { REPO_URL, SITE_NAME } from '@/lib/brand'

/**
 * Pied de page minimal. Sa raison d'être : rendre la politique de
 * confidentialité atteignable depuis n'importe quelle page, comme l'exige le
 * RGPD — et, depuis l'issue #14, le choix de la langue.
 */
export function SiteFooter() {
  const t = useTranslations('layout.footer')
  return (
    <footer className="border-t border-line">
      <nav
        aria-label={t('nav')}
        className="container-app flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-5 text-xs text-muted-foreground"
      >
        <span>{SITE_NAME}</span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link href={router.changelog()} className="font-medium hover:text-ink">
            {t('changelog')}
          </Link>
          <Link href={router.privacy()} className="font-medium hover:text-ink">
            {t('privacy')}
          </Link>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium hover:text-ink"
          >
            {t('source')}
          </a>
          <LocaleSwitcher />
        </span>
      </nav>
    </footer>
  )
}
