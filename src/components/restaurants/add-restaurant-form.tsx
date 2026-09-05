'use client'

import { RiAlertLine } from '@remixicon/react'
import { useEffect, useId, useRef, useState, useTransition } from 'react'

import { createRestaurantAction, findSimilarRestaurantsAction } from '@/actions/restaurants'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import {
  PRICE_LEVELS,
  PRICE_LEVEL_LABELS,
  RESTAURANT_ADDRESS_MAX,
  RESTAURANT_CUISINE_MAX,
  RESTAURANT_NAME_MAX,
  RESTAURANT_NAME_MIN,
} from '@/domain/schemas/restaurant'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { cn } from '@/lib/utils'

import type { Restaurant } from '@/data-access/models'

interface AddRestaurantFormProps {
  /** Pré-remplit le nom avec ce que la personne cherchait. */
  defaultName?: string
  /** Appelé avec le resto créé — ou avec un doublon existant qu'elle préfère. */
  onAdded: (restaurant: Restaurant) => void
  onCancel: () => void
}

/**
 * Ajout manuel d'un restaurant.
 *
 * Ce n'est volontairement pas un `<form>` : le composant est monté à
 * l'intérieur du formulaire de création de session ou de liste, et un
 * formulaire imbriqué est du HTML invalide. La soumission passe donc par le
 * bouton et par la touche Entrée.
 */
export function AddRestaurantForm({ defaultName = '', onAdded, onCancel }: AddRestaurantFormProps) {
  const fieldId = useId()
  const [name, setName] = useState(defaultName)
  const [cuisineType, setCuisineType] = useState('')
  const [address, setAddress] = useState('')
  const [priceLevel, setPriceLevel] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Résultats gardés avec le nom qui les a produits : rien de périmé à l'écran. */
  const [similar, setSimilar] = useState<{ name: string; items: Restaurant[] }>({
    name: '',
    items: [],
  })
  const [isSubmitting, startSubmit] = useTransition()

  const debouncedName = useDebouncedValue(name, 400)
  const candidate = debouncedName.trim()
  const canLookup = candidate.length >= RESTAURANT_NAME_MIN
  const lastLookup = useRef<string | null>(null)

  useEffect(() => {
    if (!canLookup || candidate === lastLookup.current) return
    lastLookup.current = candidate

    let cancelled = false
    findSimilarRestaurantsAction(candidate).then((result) => {
      if (!cancelled) setSimilar({ name: candidate, items: result.ok ? result.data : [] })
    })
    return () => {
      cancelled = true
    }
  }, [candidate, canLookup])

  const similarItems = similar.name === candidate ? similar.items : []

  function submit() {
    if (name.trim().length < RESTAURANT_NAME_MIN || isSubmitting) return
    setError(null)
    startSubmit(async () => {
      const result = await createRestaurantAction({ name, cuisineType, address, priceLevel })
      if (!result.ok) {
        setError(result.error)
        return
      }
      onAdded(result.data)
    })
  }

  function submitOnEnter(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    submit()
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface p-3 ring-1 ring-line">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${fieldId}-name`}>Nom du resto</Label>
        <Input
          id={`${fieldId}-name`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={submitOnEnter}
          placeholder="Le petit libanais"
          maxLength={RESTAURANT_NAME_MAX}
          autoComplete="off"
          autoFocus
          required
        />
      </div>

      {similarItems.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md bg-surface-2 px-3 py-2.5">
          <p className="flex items-start gap-2 text-sm text-ink-2">
            <RiAlertLine
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            />
            <span>Un resto au nom proche existe déjà. C’est peut-être le même :</span>
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {similarItems.map((restaurant) => (
              <li key={restaurant.id}>
                <button
                  type="button"
                  onClick={() => onAdded(restaurant)}
                  className="inline-flex items-center gap-1 rounded-full bg-surface py-1 pr-3 pl-3 text-xs font-semibold text-ink-2 ring-1 ring-line-strong hover:bg-brand-soft hover:text-brand-hover"
                >
                  {restaurant.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${fieldId}-cuisine`}>
            Cuisine <span className="text-muted-foreground">(optionnel)</span>
          </Label>
          <Input
            id={`${fieldId}-cuisine`}
            value={cuisineType}
            onChange={(event) => setCuisineType(event.target.value)}
            onKeyDown={submitOnEnter}
            placeholder="Libanais"
            maxLength={RESTAURANT_CUISINE_MAX}
            autoComplete="off"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${fieldId}-address`}>
            Adresse <span className="text-muted-foreground">(optionnel)</span>
          </Label>
          <Input
            id={`${fieldId}-address`}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            onKeyDown={submitOnEnter}
            placeholder="3 rue du Four"
            maxLength={RESTAURANT_ADDRESS_MAX}
            autoComplete="off"
          />
        </div>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm leading-none font-medium text-ink">
          Budget <span className="text-muted-foreground">(optionnel)</span>
        </legend>
        <div role="radiogroup" aria-label="Budget" className="flex gap-1.5">
          {PRICE_LEVELS.map((level) => {
            const isSelected = priceLevel === level
            return (
              <button
                key={level}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={PRICE_LEVEL_LABELS[level]}
                onClick={() => setPriceLevel(isSelected ? null : level)}
                className={cn(
                  'h-9 flex-1 rounded-md border text-sm font-semibold transition-colors',
                  isSelected
                    ? 'border-brand bg-brand-soft text-brand-hover'
                    : 'border-line-strong bg-surface text-ink-2 hover:bg-surface-2'
                )}
              >
                {PRICE_LEVEL_LABELS[level]}
              </button>
            )
          })}
        </div>
      </fieldset>

      <FormMessage error={error} />

      <div className="flex gap-2">
        <Button
          type="button"
          onClick={submit}
          disabled={isSubmitting || name.trim().length < RESTAURANT_NAME_MIN}
          className="flex-1"
        >
          {isSubmitting ? <Spinner /> : 'Ajouter ce resto'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          Annuler
        </Button>
      </div>
    </div>
  )
}
