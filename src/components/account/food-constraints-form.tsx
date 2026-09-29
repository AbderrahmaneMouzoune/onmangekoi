'use client'

import { useActionState, useEffect, useRef } from 'react'

import { saveFoodConstraintsAction } from '@/actions/food-constraints'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Spinner } from '@/components/ui/spinner'
import {
  PRICE_LEVEL_LABELS,
  PRICE_LEVELS,
  RESTAURANT_TAG_LABELS,
  RESTAURANT_TAGS,
} from '@/domain/schemas/restaurant'
import { captureEvent } from '@/lib/analytics/client'
import { cn } from '@/lib/utils'

import type { FoodConstraints } from '@/domain/food-constraints'

interface FoodConstraintsFormProps {
  initial: FoodConstraints
}

/**
 * Une vraie case ou un vrai bouton radio, habillé en chip : le clavier, le
 * lecteur d'écran et l'envoi du formulaire marchent sans rien réécrire. Le
 * contour de focus suit l'input caché visuellement.
 */
const CHIP = cn(
  'relative inline-flex h-9 cursor-pointer items-center rounded-full border px-3 text-sm font-semibold transition-colors',
  'border-line-strong bg-surface text-ink-2 hover:bg-surface-2',
  'has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:checked]:text-brand-hover',
  'has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring'
)

/** L'input reste dans l'arbre d'accessibilité, seulement invisible. */
const HIDDEN_INPUT = 'absolute inset-0 m-0 cursor-pointer appearance-none opacity-0'

/**
 * « Ce que je ne peux pas manger » (issue #60). Des cases pour les régimes,
 * un budget maximum, un seul bouton. Tout décocher et « Pas de plafond »
 * retirent tout : revenir en arrière, c'est le même geste.
 */
export function FoodConstraintsForm({ initial }: FoodConstraintsFormProps) {
  const [state, formAction, isPending] = useActionState(saveFoodConstraintsAction, null)
  /** Le compte envoyé à la mesure, relevé au moment de l'envoi. */
  const submittedCount = useRef(0)

  // Un compte, jamais le détail : un régime halal ou casher dit une religion.
  useEffect(() => {
    if (state?.success) {
      captureEvent('constraints_updated', { constraint_count: submittedCount.current })
    }
  }, [state])

  function rememberCount(event: React.FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget)
    submittedCount.current = data.getAll('tags').length + (data.get('maxPriceLevel') ? 1 : 0)
  }

  return (
    <form action={formAction} onSubmit={rememberCount} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm leading-none font-medium text-ink">
          Régime à respecter
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {RESTAURANT_TAGS.map((tag) => (
            <label key={tag} className={CHIP}>
              <input
                type="checkbox"
                name="tags"
                value={tag}
                defaultChecked={initial.tags.includes(tag)}
                className={HIDDEN_INPUT}
              />
              {RESTAURANT_TAG_LABELS[tag]}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm leading-none font-medium text-ink">Budget maximum</legend>
        <div className="flex flex-wrap gap-1.5">
          <label className={CHIP}>
            <input
              type="radio"
              name="maxPriceLevel"
              value=""
              defaultChecked={initial.maxPriceLevel === null}
              className={HIDDEN_INPUT}
            />
            Pas de plafond
          </label>
          {PRICE_LEVELS.map((level) => (
            <label key={level} className={CHIP}>
              <input
                type="radio"
                name="maxPriceLevel"
                value={level}
                defaultChecked={initial.maxPriceLevel === level}
                // « €€ » se lit mal à voix haute : le libellé dit la règle.
                aria-label={`Au plus ${PRICE_LEVEL_LABELS[level]}`}
                className={HIDDEN_INPUT}
              />
              <span aria-hidden="true">{PRICE_LEVEL_LABELS[level]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Button type="submit" variant="secondary" disabled={isPending} className="self-start">
          {isPending ? <Spinner /> : 'Enregistrer'}
        </Button>
        <FormMessage error={state?.error} success={state?.success} />
      </div>
    </form>
  )
}
