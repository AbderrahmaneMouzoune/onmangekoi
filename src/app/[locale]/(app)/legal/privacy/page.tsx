import { RiDownloadLine, RiEyeOffLine, RiUserSettingsLine } from '@remixicon/react'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'

import { PageHeader } from '@/components/layout/page-header'
import { Shell } from '@/components/layout/shell'
import { buttonVariants } from '@/components/ui/button'
import { router } from '@/config/router.config'
import { CONTACT_URL, SITE_NAME } from '@/lib/brand'
import { cn } from '@/lib/utils'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const [tTitles, t] = await Promise.all([
    getTranslations('metadata.titles'),
    getTranslations('metadata.privacy'),
  ])
  return { title: tTitles('privacy'), description: t('description', { site: SITE_NAME }) }
}

/** Dernière révision du texte — à remonter à chaque modification de fond. */
const LAST_UPDATED = '2026-09-29'

/** Les lignes du tableau de conservation ; leurs textes vivent dans `legal.privacy.retention.rows`. */
const RETENTION = [
  'pseudo',
  'credentials',
  'lists',
  'groups',
  'sessions',
  'votes',
  'constraints',
  'push',
  'guests',
  'attempts',
] as const

const CONSTRAINT_POINTS = ['nobody', 'countOnly', 'noAnalytics', 'export'] as const

const DELETION_POINTS = ['erased', 'groups', 'votes', 'sessions', 'pendingVotes'] as const

function strong(chunks: React.ReactNode) {
  return <strong className="font-semibold text-ink">{chunks}</strong>
}

export default function PrivacyPage() {
  const t = useTranslations('legal.privacy')
  const tCommon = useTranslations('common')
  const format = useFormatter()
  return (
    <Shell size="reading">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description', { site: SITE_NAME })}
        back={{ href: router.home(), label: tCommon('actions.home') }}
      />

      <p className="text-sm text-muted-foreground">
        {t('lastUpdated', {
          date: format.dateTime(new Date(`${LAST_UPDATED}T12:00:00Z`), {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }),
        })}
      </p>

      <section className="flex flex-col gap-3 rounded-lg bg-surface p-4 ring-1 ring-line">
        <h2 className="font-display text-base font-semibold">{t('summary.title')}</h2>
        <ul className="flex flex-col gap-2.5 text-sm text-ink-2">
          <li className="flex gap-2.5">
            <RiUserSettingsLine aria-hidden="true" className="mt-0.5 size-4.5 shrink-0" />
            <span>{t('summary.pseudo')}</span>
          </li>
          <li className="flex gap-2.5">
            <RiEyeOffLine aria-hidden="true" className="mt-0.5 size-4.5 shrink-0" />
            <span>{t('summary.noTracking')}</span>
          </li>
          <li className="flex gap-2.5">
            <RiDownloadLine aria-hidden="true" className="mt-0.5 size-4.5 shrink-0" />
            <span>{t('summary.selfService')}</span>
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold">{t('retention.title')}</h2>
        {/* Le tableau déborde sur petit écran : la zone qui défile doit être
            atteignable au clavier, donc focalisable et nommée. */}
        <div
          tabIndex={0}
          role="group"
          aria-label={t('retention.title')}
          className="overflow-x-auto rounded-lg ring-1 ring-line outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          <table className="w-full min-w-lg border-collapse text-left text-sm">
            <thead className="bg-surface-2 text-xs text-muted-foreground uppercase">
              <tr>
                <th className="px-3 py-2.5 font-semibold">{t('retention.data')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('retention.why')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('retention.kept')}</th>
              </tr>
            </thead>
            <tbody>
              {RETENTION.map((row) => (
                <tr key={row} className="border-t border-line bg-surface align-top">
                  <th scope="row" className="px-3 py-3 font-medium">
                    {t(`retention.rows.${row}.data`)}
                  </th>
                  <td className="px-3 py-3 text-ink-2">{t(`retention.rows.${row}.why`)}</td>
                  <td className="px-3 py-3 text-ink-2">{t(`retention.rows.${row}.kept`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold">{t('constraints.title')}</h2>
        <p className="text-sm text-ink-2">{t('constraints.intro')}</p>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-ink-2 marker:text-line-strong">
          {CONSTRAINT_POINTS.map((point) => (
            <li key={point}>{t(`constraints.${point}`)}</li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold">{t('deletion.title')}</h2>
        <p className="text-sm text-ink-2">{t('deletion.intro')}</p>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-ink-2 marker:text-line-strong">
          {DELETION_POINTS.map((point) => (
            <li key={point}>{t(`deletion.${point}`)}</li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold">{t('hosting.title')}</h2>
        <p className="text-sm text-ink-2">{t.rich('hosting.providers', { strong })}</p>
        <p className="text-sm text-ink-2">{t('hosting.push')}</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold">{t('rights.title')}</h2>
        <p className="text-sm text-ink-2">{t('rights.text')}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href={router.account()}
            className={cn(buttonVariants({ variant: 'outline' }), 'sm:flex-1')}
          >
            {t('rights.account')}
          </Link>
          <a
            href={CONTACT_URL}
            target="_blank"
            rel="noreferrer noopener"
            className={cn(buttonVariants({ variant: 'ghost' }), 'sm:flex-1')}
          >
            {t('rights.contact')}
          </a>
        </div>
      </section>
    </Shell>
  )
}
