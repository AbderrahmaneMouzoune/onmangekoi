import { RiSparkling2Line } from '@remixicon/react'

import { Button } from '@/components/ui/button'

interface SuggestionNoticeProps {
  /** D'où vient la sélection — `suggestionSummary` */
  summary: string
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
  return (
    <aside
      aria-label="Sélection proposée"
      className="flex items-start gap-3 rounded-lg border border-line bg-surface-2 p-3.5"
    >
      <RiSparkling2Line aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-sm font-medium">Une sélection pour démarrer</p>
        <p className="text-xs text-muted-foreground">{summary} Tout reste modifiable.</p>
      </div>
      <Button type="button" variant="ghost" size="sm" className="-my-1 shrink-0" onClick={onReset}>
        Repartir de zéro
      </Button>
    </aside>
  )
}
