'use client'

import { RiAlertLine, RiSparkling2Line } from '@remixicon/react'
import { useFormatter, useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState, useTransition } from 'react'

import {
  createRestaurantAction,
  findSimilarRestaurantsAction,
  suggestRestaurantDetailsAction,
} from '@/actions/restaurants'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import {
  applicableSuggestion,
  suggestionCacheKey,
  type RestaurantSuggestion,
} from '@/domain/restaurant-suggestion'
import {
  PRICE_LEVELS,
  PRICE_LEVEL_LABELS,
  RESTAURANT_ADDRESS_MAX,
  RESTAURANT_CUISINE_MAX,
  RESTAURANT_NAME_MAX,
  RESTAURANT_NAME_MIN,
  RESTAURANT_TAGS,
} from '@/domain/schemas/restaurant'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useRovingFocus } from '@/hooks/use-roving-focus'
import { cn } from '@/lib/utils'

import type { Restaurant } from '@/data-access/models'
import type { RestaurantTag } from '@/domain/schemas/restaurant'

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
 * bouton et par la touche Entrée ; Échap annule, comme pour une modale.
 */
/** En dessous, un nom ne désigne pas assez un resto pour valoir une recherche. */
const SUGGESTION_NAME_MIN = 3

export function AddRestaurantForm({ defaultName = '', onAdded, onCancel }: AddRestaurantFormProps) {
  const fieldId = useId()
  const [name, setName] = useState(defaultName)
  const [cuisineType, setCuisineType] = useState('')
  const [address, setAddress] = useState('')
  const [priceLevel, setPriceLevel] = useState<number | null>(null)
  const [tags, setTags] = useState<RestaurantTag[]>([])
  const [error, setError] = useState<string | null>(null)
  /** Résultats gardés avec le nom qui les a produits : rien de périmé à l'écran. */
  const [similar, setSimilar] = useState<{ name: string; items: Restaurant[] }>({
    name: '',
    items: [],
  })
  const [isSubmitting, startSubmit] = useTransition()
  /**
   * Champs que la personne a modifiés elle-même. La proposition ne touche
   * qu'aux autres : ce qu'elle a écrit — ou effacé — gagne toujours.
   */
  const [touched, setTouched] = useState({ cuisineType: false, priceLevel: false, tags: false })
  /** Proposition affichée, gardée avec la clé (nom + adresse) qui l'a produite. */
  const [suggestion, setSuggestion] = useState<{
    key: string
    filled: RestaurantSuggestion
  } | null>(null)
  const [pendingSuggestionKey, setPendingSuggestionKey] = useState<string | null>(null)
  const t = useTranslations('restaurants')
  const tCommon = useTranslations('common')
  const format = useFormatter()
  const formatList = (items: string[]) => format.list(items, { type: 'conjunction' })
  const optional = (chunks: React.ReactNode) => (
    <span className="text-muted-foreground">{chunks}</span>
  )

  const debouncedName = useDebouncedValue(name, 400)
  const candidate = debouncedName.trim()
  const canLookup = candidate.length >= RESTAURANT_NAME_MIN
  const lastLookup = useRef<string | null>(null)
  /** Les flèches passent d'un budget à l'autre et le sélectionnent (radios). */
  const onBudgetKeyDown = useRovingFocus((index) => {
    markTouched('priceLevel')
    setPriceLevel(PRICE_LEVELS[index])
  })

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

  /**
   * Proposition de fiche : une fois le nom posé (et l'adresse, si elle
   * vient), le serveur cherche le resto et remplit ce qui est encore vide.
   * Attente plus longue que pour les doublons — une recherche web coûte plus
   * qu'une requête en base, et on attend que la personne ait fini de taper.
   */
  const settledName = useDebouncedValue(name, 900).trim()
  const settledAddress = useDebouncedValue(address, 900).trim()
  const canSuggest = settledName.length >= SUGGESTION_NAME_MIN
  const suggestionKey = canSuggest ? suggestionCacheKey(settledName, settledAddress) : null
  /** Copie lue par la réponse asynchrone, qui ne doit pas relancer la recherche. */
  const touchedRef = useRef(touched)
  const lastSuggestionKey = useRef<string | null>(null)

  useEffect(() => {
    if (!suggestionKey || suggestionKey === lastSuggestionKey.current) return
    lastSuggestionKey.current = suggestionKey
    setPendingSuggestionKey(suggestionKey)

    let cancelled = false
    suggestRestaurantDetailsAction({ name: settledName, address: settledAddress || null }).then(
      (result) => {
        if (cancelled) return
        setPendingSuggestionKey(null)
        const proposal = result.ok ? result.data : null
        const filled = applicableSuggestion(
          proposal ?? { cuisineType: null, priceLevel: null, tags: [] },
          touchedRef.current
        )
        // Les champs non touchés suivent la proposition — y compris pour se
        // vider quand le nom a changé et que le nouveau resto est introuvable :
        // une cuisine trouvée pour un autre resto n'a rien à faire là.
        if (!touchedRef.current.cuisineType) setCuisineType(filled.cuisineType ?? '')
        if (!touchedRef.current.priceLevel) setPriceLevel(filled.priceLevel)
        if (!touchedRef.current.tags) setTags(filled.tags)
        setSuggestion({ key: suggestionKey, filled })
      }
    )
    return () => {
      cancelled = true
    }
  }, [suggestionKey, settledName, settledAddress])

  const isLookingUp = pendingSuggestionKey !== null && pendingSuggestionKey === suggestionKey
  const filledLabels = suggestion
    ? [
        suggestion.filled.cuisineType && !touched.cuisineType ? t('add.suggested.cuisine') : null,
        suggestion.filled.priceLevel && !touched.priceLevel ? t('add.suggested.budget') : null,
        suggestion.filled.tags.length > 0 && !touched.tags ? t('add.suggested.diet') : null,
      ].filter((label): label is string => label !== null)
    : []

  function submit() {
    if (name.trim().length < RESTAURANT_NAME_MIN || isSubmitting) return
    setError(null)
    startSubmit(async () => {
      const result = await createRestaurantAction({ name, cuisineType, address, priceLevel, tags })
      if (!result.ok) {
        setError(result.error)
        return
      }
      onAdded(result.data)
    })
  }

  function markTouched(field: keyof typeof touched) {
    touchedRef.current = { ...touchedRef.current, [field]: true }
    setTouched(touchedRef.current)
  }

  function toggleTag(tag: RestaurantTag) {
    markTouched('tags')
    setTags((prev) => (prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]))
  }

  function submitOnEnter(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    submit()
  }

  function cancelOnEscape(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape' || isSubmitting) return
    event.preventDefault()
    event.stopPropagation()
    onCancel()
  }

  return (
    <div
      role="group"
      aria-label={t('add.label')}
      onKeyDown={cancelOnEscape}
      className="flex flex-col gap-3 rounded-lg bg-surface p-3 ring-1 ring-line"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${fieldId}-name`}>{t('add.name')}</Label>
        <Input
          id={`${fieldId}-name`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={submitOnEnter}
          placeholder={t('add.namePlaceholder')}
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
            <span>{t('add.similar')}</span>
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
          <Label htmlFor={`${fieldId}-cuisine`}>{t.rich('add.cuisine', { optional })}</Label>
          <Input
            id={`${fieldId}-cuisine`}
            value={cuisineType}
            onChange={(event) => {
              markTouched('cuisineType')
              setCuisineType(event.target.value)
            }}
            onKeyDown={submitOnEnter}
            placeholder={t('add.cuisinePlaceholder')}
            maxLength={RESTAURANT_CUISINE_MAX}
            autoComplete="off"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${fieldId}-address`}>{t.rich('add.address', { optional })}</Label>
          <Input
            id={`${fieldId}-address`}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            onKeyDown={submitOnEnter}
            placeholder={t('add.addressPlaceholder')}
            maxLength={RESTAURANT_ADDRESS_MAX}
            autoComplete="off"
          />
        </div>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm leading-none font-medium text-ink">
          {t.rich('add.budget', { optional })}
        </legend>
        <div
          role="radiogroup"
          aria-label={t('add.budgetLabel')}
          onKeyDown={onBudgetKeyDown}
          className="flex gap-1.5"
        >
          {PRICE_LEVELS.map((level, index) => {
            const isSelected = priceLevel === level
            // Un seul arrêt de tabulation : le budget choisi, sinon le premier.
            const isTabStop = priceLevel === null ? index === 0 : isSelected
            return (
              <button
                key={level}
                type="button"
                role="radio"
                data-roving
                tabIndex={isTabStop ? 0 : -1}
                aria-checked={isSelected}
                aria-label={PRICE_LEVEL_LABELS[level]}
                onClick={() => {
                  markTouched('priceLevel')
                  setPriceLevel(isSelected ? null : level)
                }}
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

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm leading-none font-medium text-ink">
          {t.rich('add.diet', { optional })}
        </legend>
        {/* Ce qu'on déclare ici alimente les filtres de la création de
            session : un resto tagué évite un veto prévisible. */}
        <div role="group" aria-label={t('add.dietLabel')} className="flex flex-wrap gap-1.5">
          {RESTAURANT_TAGS.map((tag) => {
            const isSelected = tags.includes(tag)
            return (
              <button
                key={tag}
                type="button"
                role="checkbox"
                aria-checked={isSelected}
                onClick={() => toggleTag(tag)}
                className={cn(
                  'h-9 rounded-full border px-3 text-sm font-semibold transition-colors',
                  isSelected
                    ? 'border-brand bg-brand-soft text-brand-hover'
                    : 'border-line-strong bg-surface text-ink-2 hover:bg-surface-2'
                )}
              >
                {t(`tags.${tag}`)}
              </button>
            )
          })}
        </div>
      </fieldset>

      {/* Une ligne discrète, jamais un badge : la fiche se remplit, et l'on
          dit d'où ça vient pour que personne ne prenne un régime proposé
          pour une certitude. */}
      <p aria-live="polite" className="min-h-5 text-xs text-muted-foreground">
        {isLookingUp ? (
          <span className="inline-flex items-center gap-1.5">
            <Spinner className="size-3" />
            {t('add.suggested.looking')}
          </span>
        ) : filledLabels.length > 0 ? (
          <span className="inline-flex items-start gap-1.5">
            <RiSparkling2Line aria-hidden="true" className="mt-px size-3.5 shrink-0" />
            {t('add.suggested.filled', { fields: formatList(filledLabels) })}
          </span>
        ) : null}
      </p>

      <FormMessage error={error} />

      <div className="flex gap-2">
        <Button
          type="button"
          onClick={submit}
          disabled={isSubmitting || name.trim().length < RESTAURANT_NAME_MIN}
          className="flex-1"
        >
          {isSubmitting ? <Spinner /> : t('add.submit')}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          {tCommon('actions.cancel')}
        </Button>
      </div>
    </div>
  )
}
