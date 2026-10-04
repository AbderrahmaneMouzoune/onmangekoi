import { RiSparkling2Line } from '@remixicon/react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'

import type { SuggestionSummary } from '@/domain/suggestions'

interface SuggestionNoticeProps {
  /** D'où vient la sélection — `suggestionSummary` */
  summary: SuggestionSummary
  /** Décoche la proposition d'un bloc */
  onReset: () => void
}

/**
 * Le bandeau qui accompagne une sélection proposée : il dit d'où elle vient
 * et permet de la jeter d'un clic. Sans lui, cinq restos cochés d'office
 * ressembleraient à une erreur — et une pré-sélection qu'on ne comprend pas,
 * on la décoche en bloc.
 */
export function SuggestionNotice({ summary, onReset }: SuggestionNoticeProps) {
  const t = useTranslations('session.suggestion')
  return (
    <aside
      aria-label={t('label')}
      className="flex items-start gap-3 rounded-lg border border-line bg-surface-2 p-3.5"
    >
      <RiSparkling2Line aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-sm font-medium">{t('title')}</p>
        <p className="text-xs text-muted-foreground">
          {t('summary', summary)} {t('editable')}
        </p>
      </div>
      <Button type="button" variant="ghost" size="sm" className="-my-1 shrink-0" onClick={onReset}>
        {t('reset')}
      </Button>
    </aside>
  )
}
