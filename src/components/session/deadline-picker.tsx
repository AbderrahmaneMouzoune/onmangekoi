'use client'

import { useMemo, useState } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DEADLINE_PRESETS, nextOccurrence } from '@/domain/session-deadline'
import { cn } from '@/lib/utils'

type Choice = 'none' | 'at' | `in:${number}`

const OPTIONS: { value: Choice; label: string }[] = [
  { value: 'none', label: 'Sans limite' },
  ...DEADLINE_PRESETS.map((minutes) => ({
    value: `in:${minutes}` as Choice,
    label: minutes >= 60 ? `dans ${minutes / 60} h` : `dans ${minutes} min`,
  })),
  { value: 'at', label: 'à une heure' },
]

const HINTS = {
  none: 'Sans échéance, la session se clôture quand tout le monde a voté — ou quand tu la clôtures.',
  timed:
    'À l’heure dite, le classement s’affiche : les votes manquants comptent 0. Tu pourras prolonger avant.',
}

const LEGEND = 'Clôture automatique'

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
export function DeadlinePicker() {
  const [choice, setChoice] = useState<Choice>('none')
  const [time, setTime] = useState('')

  const target = useMemo(() => (choice === 'at' ? nextOccurrence(time) : null), [choice, time])
  const minutes = choice.startsWith('in:') ? Number(choice.slice(3)) : null

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">{LEGEND}</legend>

      <div role="radiogroup" aria-label={LEGEND} className="flex flex-wrap gap-2">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={choice === option.value}
            onClick={() => setChoice(option.value)}
            className={cn(optionClassName(choice === option.value), 'hover:bg-surface-2')}
          >
            {option.label}
          </button>
        ))}
      </div>

      {choice === 'at' && (
        <div className="flex flex-col gap-2 pt-1">
          <Label htmlFor="closes-time">Heure de clôture</Label>
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
        {choice === 'none' ? HINTS.none : HINTS.timed}
      </p>
    </fieldset>
  )
}

/**
 * Silhouette : les mêmes intitulés dans leur état de départ, sans interaction.
 * Rien ici n'attend le serveur — seule la place doit être tenue le temps que
 * le formulaire arrive.
 */
export function DeadlinePickerFallback() {
  return (
    <div className="flex flex-col gap-2">
      <p className="mb-2 text-sm font-medium">{LEGEND}</p>
      {/* Les pastilles ne sont pas encore des boutons : les annoncer comme des
          choix serait mentir le temps d'un battement de cil. */}
      <div aria-hidden="true" className="flex flex-wrap gap-2">
        {OPTIONS.map((option) => (
          <span key={option.value} className={optionClassName(option.value === 'none')}>
            {option.label}
          </span>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{HINTS.none}</p>
    </div>
  )
}
