'use client'

import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DEADLINE_PRESETS, nextOccurrence } from '@/domain/session-deadline'
import { useRovingFocus } from '@/hooks/use-roving-focus'
import { cn } from '@/lib/utils'

type Choice = 'none' | 'at' | `in:${number}`

const OPTIONS: Choice[] = [
  'none',
  ...DEADLINE_PRESETS.map((minutes) => `in:${minutes}` as Choice),
  'at',
]

/** Sans « Sans limite » : une session ouverte ne se fermerait jamais. */
const REQUIRED_OPTIONS = OPTIONS.filter((option) => option !== 'none')

/** Le libellé d'un choix : « Sans limite », « dans 10 min », « dans 1 h », « à une heure ». */
function useOptionLabel(): (choice: Choice) => string {
  const t = useTranslations('session.deadline')
  return (choice) => {
    if (choice === 'none') return t('none')
    if (choice === 'at') return t('at')
    const minutes = Number(choice.slice(3))
    return minutes >= 60 ? t('inHours', { hours: minutes / 60 }) : t('inMinutes', { minutes })
  }
}

/**
 * Ce que prend l'échéance quand elle devient obligatoire alors que rien
 * n'était choisi : la plus longue des durées proposées. Une session ouverte
 * vit au rythme d'une conversation, pas d'une tablée.
 */
const REQUIRED_DEFAULT: Choice = `in:${Math.max(...DEADLINE_PRESETS)}`

function DefaultLegend() {
  const t = useTranslations('session.deadline')
  return <span className="text-sm font-medium">{t('legend')}</span>
}

function optionClassName(isSelected: boolean) {
  return cn(
    'rounded-full border px-3.5 py-1.5 text-sm transition-colors',
    isSelected
      ? 'border-brand bg-brand-soft font-medium text-brand-hover'
      : 'border-line bg-surface text-ink-2'
  )
}

/**
 * Choix de l'échéance de clôture, à la création : rien, une durée, ou une
 * heure précise. Une durée part de l'horloge du serveur au moment de la
 * création ; une heure précise est convertie ici en instant absolu, le
 * navigateur étant le seul à connaître le fuseau de la personne.
 */
interface DeadlinePickerProps {
  /** Intitulé du bloc ; par défaut « Clôture automatique », en petit. */
  legend?: React.ReactNode
  /**
   * L'échéance est obligatoire (session ouverte) : « Sans limite » disparaît
   * et, s'il était choisi, cède la place à une durée par défaut.
   */
  required?: boolean
}

export function DeadlinePicker({ legend, required = false }: DeadlinePickerProps = {}) {
  const [picked, setChoice] = useState<Choice>('none')
  const [time, setTime] = useState('')
  const t = useTranslations('session.deadline')
  const optionLabel = useOptionLabel()

  // Dérivé plutôt que réécrit : décocher « ouverte » rend le choix d'avant.
  const choice = required && picked === 'none' ? REQUIRED_DEFAULT : picked
  const options = required ? REQUIRED_OPTIONS : OPTIONS

  const target = useMemo(() => (choice === 'at' ? nextOccurrence(time) : null), [choice, time])
  const minutes = choice.startsWith('in:') ? Number(choice.slice(3)) : null
  /** Les flèches passent d'une option à l'autre et la choisissent (radios). */
  const onOptionsKeyDown = useRovingFocus((index) => setChoice(options[index]))

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2">{legend ?? <DefaultLegend />}</legend>

      <div
        role="radiogroup"
        aria-label={t('legend')}
        onKeyDown={onOptionsKeyDown}
        className="flex flex-wrap gap-2"
      >
        {options.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            data-roving
            tabIndex={choice === option ? 0 : -1}
            aria-checked={choice === option}
            onClick={() => setChoice(option)}
            className={cn(optionClassName(choice === option), 'hover:bg-surface-2')}
          >
            {optionLabel(option)}
          </button>
        ))}
      </div>

      {choice === 'at' && (
        <div className="flex flex-col gap-2 pt-1">
          <Label htmlFor="closes-time">{t('time')}</Label>
          <Input
            id="closes-time"
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            className="w-36"
          />
        </div>
      )}

      {minutes !== null && <input type="hidden" name="closesInMinutes" value={minutes} />}
      {target && <input type="hidden" name="closesAt" value={target.toISOString()} />}

      <p className="text-xs text-muted-foreground">
        {required ? t('hints.required') : choice === 'none' ? t('hints.none') : t('hints.timed')}
      </p>
    </fieldset>
  )
}

/**
 * Silhouette : les mêmes intitulés dans leur état de départ, sans interaction.
 * Rien ici n'attend le serveur — seule la place doit être tenue le temps que
 * le formulaire arrive.
 */
export function DeadlinePickerFallback({ legend }: DeadlinePickerProps = {}) {
  const t = useTranslations('session.deadline')
  const optionLabel = useOptionLabel()
  return (
    <div className="flex flex-col gap-2">
      <p className="mb-2">{legend ?? <DefaultLegend />}</p>
      {/* Les pastilles ne sont pas encore des boutons : les annoncer comme des
          choix serait mentir le temps d'un battement de cil. */}
      <div aria-hidden="true" className="flex flex-wrap gap-2">
        {OPTIONS.map((option) => (
          <span key={option} className={optionClassName(option === 'none')}>
            {optionLabel(option)}
          </span>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t('hints.none')}</p>
    </div>
  )
}
