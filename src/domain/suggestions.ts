/**
 * Une sélection proposée à la création, plutôt qu'une page blanche (#59).
 *
 * Composer la sélection est l'étape la plus lourde de la création, et elle
 * retombe sur le host à chaque midi. Corriger une proposition coûte bien
 * moins que partir de rien : à l'ouverture de « Nouvelle session », les
 * restaurants vus récemment — sans les gagnants du dernier mois — sont déjà
 * cochés, plus un jamais proposé pour ne pas tourner en rond.
 *
 * La proposition est un point de départ, jamais une contrainte : tout se
 * décoche, un par un ou d'un bloc. Et une phrase dit d'où elle vient — une
 * pré-sélection qu'on ne comprend pas, on la jette.
 *
 * Tout ce qui entre ici sort de `suggest_restaurants()`, qui ne lit que des
 * participations et des gagnants : jamais un vote.
 */
import { RECENT_WINNER_WINDOW_DAYS } from '@/domain/recent-winners'
import { plural } from '@/lib/format'

import type { Restaurant, SuggestedRestaurantRow } from '@/data-access/models'

/** Taille de la proposition : de quoi voter, assez peu pour se corriger d'un coup d'œil. */
export const SUGGESTION_SIZE = 5

/** D'où vient le resto jamais proposé : les listes et ajouts de la personne, ou le carnet. */
export type FreshSource = 'mine' | 'catalog'

export interface RestaurantSuggestion {
  /** Restaurants pré-cochés, les vus récemment d'abord, le jamais proposé en dernier */
  restaurants: Restaurant[]
  /** Combien ont été vus récemment */
  recentCount: number
  /** Gagnants récents écartés de la proposition */
  excludedWinners: number
  /** Le jamais proposé, s'il y en a un, et d'où il vient */
  fresh: FreshSource | null
}

/**
 * Met en forme la réponse de la base. Sans restaurant vu récemment, il n'y a
 * pas d'historique — donc pas de proposition : la page reste alors ce
 * qu'elle était. La base rend déjà vide dans ce cas ; on ne refait pas
 * confiance à une ligne `never_proposed` isolée pour autant.
 */
export function toRestaurantSuggestion(
  rows: readonly SuggestedRestaurantRow[]
): RestaurantSuggestion | null {
  const recentCount = rows.filter((row) => row.reason === 'recent').length
  if (recentCount === 0) return null

  const fresh = rows.find((row) => row.reason === 'never_proposed')
  return {
    restaurants: rows.map((row) => row.restaurant),
    recentCount,
    excludedWinners: rows[0].excluded_winners,
    fresh: fresh ? (fresh.source === 'mine' ? 'mine' : 'catalog') : null,
  }
}

/**
 * La phrase qui dit d'où vient la sélection :
 * « Vus récemment, sans les 3 gagnants des 30 derniers jours — plus un jamais
 * proposé, le dernier arrivé au carnet. »
 */
export function suggestionSummary(suggestion: RestaurantSuggestion): string {
  const seen = plural(suggestion.recentCount, 'Vu', 'Vus')
  const winners = suggestion.excludedWinners
  const withoutWinners =
    winners === 0
      ? ''
      : winners === 1
        ? `, sans le gagnant des ${RECENT_WINNER_WINDOW_DAYS} derniers jours`
        : `, sans les ${winners} gagnants des ${RECENT_WINNER_WINDOW_DAYS} derniers jours`
  const fresh =
    suggestion.fresh === 'mine'
      ? ' — plus un jamais proposé, le dernier que tu as ajouté'
      : suggestion.fresh === 'catalog'
        ? ' — plus un jamais proposé, le dernier arrivé au carnet'
        : ''
  return `${seen} récemment${withoutWinners}${fresh}.`
}

/** Identifiants proposés, dans l'ordre. */
export function suggestedIds(suggestion: RestaurantSuggestion | null): string[] {
  return suggestion ? suggestion.restaurants.map((restaurant) => restaurant.id) : []
}

/** Combien de restaurants proposés sont encore cochés. */
export function keptSuggestionCount(
  suggested: readonly string[],
  selected: readonly string[]
): number {
  const chosen = new Set(selected)
  return suggested.filter((id) => chosen.has(id)).length
}

/** Décoche la proposition d'un bloc, sans toucher à ce que la personne a pris elle-même. */
export function withoutSuggestion(
  selected: readonly string[],
  suggested: readonly string[]
): string[] {
  const proposed = new Set(suggested)
  return selected.filter((id) => !proposed.has(id))
}
