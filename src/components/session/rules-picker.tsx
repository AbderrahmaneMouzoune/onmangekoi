'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'

import { useRuleLineText } from '@/components/session/rules-summary'
import {
  CLOSE_AT_RATIO_CHOICES,
  DEFAULT_SESSION_RULES,
  JOKER_CHOICES,
  describeRules,
} from '@/domain/session-rules'
import { percentLabel } from '@/lib/format'
import { cn } from '@/lib/utils'

function optionClassName(isSelected: boolean) {
  return cn(
    'rounded-full border px-3.5 py-1.5 text-sm transition-colors',
    isSelected
      ? 'border-brand bg-brand-soft font-medium text-brand-hover'
      : 'border-line bg-surface text-ink-2'
  )
}

interface ChoiceGroupProps<T extends number> {
  legend: string
  options: readonly T[]
  value: T
  onChange: (value: T) => void
  label: (value: T) => string
  name: string
}

function ChoiceGroup<T extends number>({
  legend,
  options,
  value,
  onChange,
  label,
  name,
}: ChoiceGroupProps<T>) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div role="radiogroup" aria-label={legend} className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            onClick={() => onChange(option)}
            className={cn(optionClassName(value === option), 'hover:bg-surface-2')}
          >
            {label(option)}
          </button>
        ))}
      </div>
      <input type="hidden" name={name} value={value} />
    </fieldset>
  )
}

interface RulesPickerProps {
  /**
   * Session ouverte, cochée plus haut dans le formulaire : le seuil n'y a pas
   * d'objet, son réglage s'efface — et n'est plus envoyé.
   */
  open?: boolean
}

/**
 * Réglage des règles à la création : quotas de jokers et seuil de clôture.
 * Replié par défaut — la majorité des groupes s'accommode très bien d'un coup
 * de cœur, d'un veto et d'une clôture à l'unanimité —, mais le résumé reste
 * lisible fermé : on voit ce qu'on s'apprête à lancer sans rien déplier.
 *
 * Un `<details>` natif plutôt qu'un accordéon maison : il s'ouvre au clavier,
 * s'annonce tout seul et fonctionne avant même que le JavaScript arrive.
 */
export function RulesPicker({ open = false }: RulesPickerProps = {}) {
  const [superlikes, setSuperlikes] = useState<number>(DEFAULT_SESSION_RULES.superlikes)
  const [vetos, setVetos] = useState<number>(DEFAULT_SESSION_RULES.vetos)
  const [closeAtRatio, setCloseAtRatio] = useState<number>(DEFAULT_SESSION_RULES.close_at_ratio)
  const t = useTranslations('session.rules')
  const locale = useLocale()
  const describe = useRuleLineText()

  const jokerLabel = (count: number) => (count === 0 ? t('picker.noJoker') : String(count))
  const ratioLabel = (ratio: number) =>
    ratio >= 1 ? t('picker.everyone') : percentLabel(ratio, locale)

  const summary = describeRules(
    open
      ? { superlikes, vetos, close_at_ratio: 1, open: true }
      : { superlikes, vetos, close_at_ratio: closeAtRatio }
  )
    .map(describe)
    .join(' · ')

  return (
    <details className="rounded-lg border border-line bg-surface">
      <summary className="cursor-pointer list-none px-4 py-3 outline-none focus-visible:ring-3 focus-visible:ring-brand [&::-webkit-details-marker]:hidden">
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{t('label')}</span>
          <span className="text-xs text-muted-foreground">{summary}</span>
        </span>
      </summary>

      <div className="flex flex-col gap-5 border-t border-line px-4 py-4">
        <ChoiceGroup
          legend={t('picker.superlikes')}
          options={JOKER_CHOICES}
          value={superlikes}
          onChange={setSuperlikes}
          label={jokerLabel}
          name="superlikes"
        />
        <ChoiceGroup
          legend={t('picker.vetos')}
          options={JOKER_CHOICES}
          value={vetos}
          onChange={setVetos}
          label={jokerLabel}
          name="vetos"
        />
        {!open && (
          <ChoiceGroup
            legend={t('picker.threshold')}
            options={CLOSE_AT_RATIO_CHOICES}
            value={closeAtRatio}
            onChange={setCloseAtRatio}
            label={ratioLabel}
            name="closeAtRatio"
          />
        )}
        <p className="text-xs text-muted-foreground">
          {open ? t('picker.openHint') : t('picker.hint')}
        </p>
      </div>
    </details>
  )
}

/**
 * Silhouette : l'intitulé et le résumé par défaut, en clair. Rien ici n'attend
 * le serveur — seule la place doit être tenue le temps que le formulaire
 * arrive, et les règles de départ sont les mêmes pour tout le monde.
 */
export function RulesPickerFallback() {
  const t = useTranslations('session.rules')
  const describe = useRuleLineText()
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <p className="text-sm font-medium">{t('label')}</p>
      <p className="text-xs text-muted-foreground">
        {describeRules(DEFAULT_SESSION_RULES).map(describe).join(' · ')}
      </p>
    </div>
  )
}
