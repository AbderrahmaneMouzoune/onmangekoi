'use client'

import { RiCloseLine } from '@remixicon/react'

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
  RESTAURANT_TAG_LABELS,
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
        <legend className="sr-only">Budget</legend>
        <FilterLabel>Budget</FilterLabel>
        <div role="radiogroup" aria-label="Budget maximum" className="flex flex-wrap gap-1.5">
          {PRICE_LEVELS.map((level) => (
            <Chip
              key={level}
              role="radio"
              selected={value.priceMax === level}
              // « ≤ €€ » se lit mal à voix haute : le libellé accessible dit
              // la règle en toutes lettres.
              label={`Budget maximum ${PRICE_LEVEL_LABELS[level]}`}
              onClick={() => togglePrice(level)}
            >
              {PRICE_LEVEL_LABELS[level]}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <legend className="sr-only">Régime alimentaire</legend>
        <FilterLabel>Régime</FilterLabel>
        <div role="group" aria-label="Régime alimentaire" className="flex flex-wrap gap-1.5">
          {RESTAURANT_TAGS.map((tag) => (
            <Chip
              key={tag}
              role="checkbox"
              selected={value.tags.includes(tag)}
              onClick={() => toggleTag(tag)}
            >
              {RESTAURANT_TAG_LABELS[tag]}
            </Chip>
          ))}
        </div>
      </fieldset>

      {here && (
        <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <legend className="sr-only">Distance</legend>
          <FilterLabel>Distance</FilterLabel>
          <div
            role="radiogroup"
            aria-label="Rayon autour de moi"
            className="flex flex-wrap gap-1.5"
          >
            {DISTANCE_CHOICES_KM.map((km) => (
              <Chip
                key={km}
                role="radio"
                selected={value.withinKm === km}
                label={`Moins de ${radiusLabel(km)} d’ici`}
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
            Tout effacer
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
function hiddenNotice(filters: RestaurantFilters): string {
  const reasons = [
    filters.priceMax !== null && 'dont le budget n’est pas renseigné',
    filters.tags.length > 0 &&
      (filters.tags.length > 1
        ? 'qui ne déclarent pas ces régimes'
        : 'qui ne déclarent pas ce régime'),
    filters.withinKm !== null && 'dont l’adresse n’est pas localisée',
  ].filter((reason): reason is string => typeof reason === 'string')

  const listed =
    reasons.length > 1
      ? `${reasons.slice(0, -1).join(', ')} et ${reasons[reasons.length - 1]}`
      : reasons[0]

  return `Les restos ${listed} n’apparaissent pas.`
}
