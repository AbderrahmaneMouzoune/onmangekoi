'use client'

import { RiCloseLine } from '@remixicon/react'
import { useLocale, useTranslations } from 'next-intl'

import {
  countActiveFilters,
  DISTANCE_CHOICES_KM,
  NO_FILTERS,
  radiusLabel,
  type RestaurantFilters,
} from '@/domain/restaurant-filters'
import {
  PRICE_LEVEL_LABELS,
  PRICE_LEVELS,
  RESTAURANT_TAGS,
  type RestaurantTag,
} from '@/domain/schemas/restaurant'
import { cn } from '@/lib/utils'

import type { GeoPoint } from '@/lib/maps'

interface RestaurantFiltersBarProps {
  value: RestaurantFilters
  onChange: (filters: RestaurantFilters) => void
  /**
   * Position de la personne, si elle l'a donnée — c'est « Autour de moi », au
   * ras des résultats, qui la demande. Sans elle, le filtre distance n'existe
   * pas : il n'aurait rien pour mesurer.
   */
  here: GeoPoint | null
}

/**
 * Chips de filtre au-dessus du carnet : budget, régime, distance.
 *
 * Tout est filtré en base — l'interface ne fait que dire ce qu'elle demande.
 * Les filtres ne concernent que le carnet : Google a sa propre recherche, et
 * une liste de favoris se prend entière.
 */
export function RestaurantFiltersBar({ value, onChange, here }: RestaurantFiltersBarProps) {
  /**
   * Les filtres tels qu'ils s'appliquent vraiment : sans position, le rayon
   * ne filtre rien. Il reste dans l'URL — la position revient, le filtre
   * avec — mais la barre ne le compte ni ne l'annonce.
   */
  const effective = here ? value : { ...value, withinKm: null }
  const activeCount = countActiveFilters(effective)
  const t = useTranslations('restaurants')
  const hiddenNotice = useHiddenNotice()

  function togglePrice(level: number) {
    onChange({ ...value, priceMax: value.priceMax === level ? null : level })
  }

  function toggleTag(tag: RestaurantTag) {
    onChange({
      ...value,
      tags: value.tags.includes(tag)
        ? value.tags.filter((item) => item !== tag)
        : [...value.tags, tag],
    })
  }

  function toggleDistance(km: number) {
    onChange({ ...value, withinKm: value.withinKm === km ? null : km })
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface p-3 ring-1 ring-line">
      <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <legend className="sr-only">{t('filters.budget')}</legend>
        <FilterLabel>{t('filters.budget')}</FilterLabel>
        <div
          role="radiogroup"
          aria-label={t('filters.budgetMax')}
          className="flex flex-wrap gap-1.5"
        >
          {PRICE_LEVELS.map((level) => (
            <Chip
              key={level}
              role="radio"
              selected={value.priceMax === level}
              // « ≤ €€ » se lit mal à voix haute : le libellé accessible dit
              // la règle en toutes lettres.
              label={t('filters.budgetMaxLevel', { level: PRICE_LEVEL_LABELS[level] })}
              onClick={() => togglePrice(level)}
            >
              {PRICE_LEVEL_LABELS[level]}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <legend className="sr-only">{t('filters.dietLabel')}</legend>
        <FilterLabel>{t('filters.diet')}</FilterLabel>
        <div role="group" aria-label={t('filters.dietLabel')} className="flex flex-wrap gap-1.5">
          {RESTAURANT_TAGS.map((tag) => (
            <Chip
              key={tag}
              role="checkbox"
              selected={value.tags.includes(tag)}
              onClick={() => toggleTag(tag)}
            >
              {t(`tags.${tag}`)}
            </Chip>
          ))}
        </div>
      </fieldset>

      {here && (
        <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <legend className="sr-only">{t('filters.distance')}</legend>
          <FilterLabel>{t('filters.distance')}</FilterLabel>
          <div
            role="radiogroup"
            aria-label={t('filters.radius')}
            className="flex flex-wrap gap-1.5"
          >
            {DISTANCE_CHOICES_KM.map((km) => (
              <Chip
                key={km}
                role="radio"
                selected={value.withinKm === km}
                label={t('filters.within', { radius: radiusLabel(km) })}
                onClick={() => toggleDistance(km)}
              >
                {radiusLabel(km)}
              </Chip>
            ))}
          </div>
        </fieldset>
      )}

      {activeCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{hiddenNotice(effective)}</p>
          <button
            type="button"
            onClick={() => onChange(NO_FILTERS)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand underline-offset-4 hover:underline"
          >
            <RiCloseLine aria-hidden="true" className="size-3.5" />
            {t('filters.clear')}
          </button>
        </div>
      )}
    </div>
  )
}

function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <span aria-hidden="true" className="w-16 text-xs font-semibold text-muted-foreground">
      {children}
    </span>
  )
}

interface ChipProps {
  role: 'radio' | 'checkbox'
  selected: boolean
  onClick: () => void
  /** Libellé accessible, quand le texte visible ne se suffit pas. */
  label?: string
  children: React.ReactNode
}

function Chip({ role, selected, onClick, label, children }: ChipProps) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={selected}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'h-8 rounded-full border px-3 text-xs font-semibold transition-colors',
        selected
          ? 'border-brand bg-brand-soft text-brand-hover'
          : 'border-line-strong bg-surface text-ink-2 hover:bg-surface-2'
      )}
    >
      {children}
    </button>
  )
}

/**
 * Ce qu'un filtre écarte en silence : un budget inconnu n'est pas un budget
 * modeste, un resto sans régime déclaré n'est pas végétarien, et un resto sans
 * coordonnées n'est pas à côté. La phrase le dit plutôt que de laisser croire
 * à un carnet plus pauvre qu'il n'est.
 */
function useHiddenNotice(): (filters: RestaurantFilters) => string {
  const t = useTranslations('restaurants.filters.hidden')
  const locale = useLocale()
  return (filters) => {
    const reasons = [
      filters.priceMax !== null && t('budget'),
      filters.tags.length > 0 && t('tags', { count: filters.tags.length }),
      filters.withinKm !== null && t('distance'),
    ].filter((reason): reason is string => typeof reason === 'string')

    const listed = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(
      reasons
    )
    return t('sentence', { reasons: listed })
  }
}
