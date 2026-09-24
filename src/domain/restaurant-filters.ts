/**
 * Filtres du catalogue : budget, régime alimentaire, distance.
 *
 * Module pur, et c'est volontaire : les mêmes fonctions lisent les filtres
 * d'une URL sur le serveur (pour que `/sessions/new?budget=2&tags=vegan`
 * arrive déjà filtrée) et les réécrivent dans la barre d'adresse côté
 * navigateur. Un lien de session pré-filtré se partage donc tel quel.
 *
 * Ce qui n'est pas reconnu est ignoré plutôt que rejeté : une URL bricolée à
 * la main ne doit jamais casser la page, au pire elle ne filtre rien.
 */
import { RESTAURANT_TAGS, type RestaurantTag } from '@/domain/schemas/restaurant'

export interface RestaurantFilters {
  /** Budget maximum accepté, de 1 à 4. `null` : pas de filtre. */
  priceMax: number | null
  /** Régimes exigés — tous à la fois, pas l'un ou l'autre. */
  tags: RestaurantTag[]
  /** Rayon autour de la position, en kilomètres. `null` : pas de filtre. */
  withinKm: number | null
}

export const NO_FILTERS: RestaurantFilters = { priceMax: null, tags: [], withinKm: null }

/** Rayons proposés, en kilomètres : la marche, le quartier, le déplacement. */
export const DISTANCE_CHOICES_KM = [0.5, 1, 2, 5] as const

/** Noms des paramètres d'URL. Changer ici casserait les liens déjà partagés. */
export const BUDGET_PARAM = 'budget'
export const TAGS_PARAM = 'tags'
export const DISTANCE_PARAM = 'km'

/** Ce que Next passe à une page serveur, ou ce que lit le navigateur. */
export type FilterSource = URLSearchParams | Record<string, string | string[] | undefined>

function read(source: FilterSource, key: string): string | null {
  if (source instanceof URLSearchParams) return source.get(key)
  const value = source[key]
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function parsePriceMax(raw: string | null): number | null {
  if (!raw) return null
  const value = Number(raw)
  return Number.isInteger(value) && value >= 1 && value <= 4 ? value : null
}

/**
 * Les régimes ressortent dans l'ordre du catalogue, pas dans celui de l'URL :
 * deux liens qui demandent la même chose produisent la même adresse, et les
 * doublons disparaissent au passage.
 */
function parseTags(raw: string | null): RestaurantTag[] {
  if (!raw) return []
  const asked = new Set(raw.split(',').map((value) => value.trim()))
  return RESTAURANT_TAGS.filter((tag) => asked.has(tag))
}

function parseWithinKm(raw: string | null): number | null {
  if (!raw) return null
  const value = Number(raw)
  return DISTANCE_CHOICES_KM.find((choice) => choice === value) ?? null
}

export function parseRestaurantFilters(source: FilterSource): RestaurantFilters {
  return {
    priceMax: parsePriceMax(read(source, BUDGET_PARAM)),
    tags: parseTags(read(source, TAGS_PARAM)),
    withinKm: parseWithinKm(read(source, DISTANCE_PARAM)),
  }
}

/**
 * Filtres → paramètres d'URL. Un filtre inactif ne laisse aucune trace : sans
 * filtre du tout, la chaîne est vide et l'adresse reste propre.
 */
export function restaurantFiltersToParams(filters: RestaurantFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.priceMax !== null) params.set(BUDGET_PARAM, String(filters.priceMax))
  if (filters.tags.length > 0) params.set(TAGS_PARAM, filters.tags.join(','))
  if (filters.withinKm !== null) params.set(DISTANCE_PARAM, String(filters.withinKm))
  return params
}

/** Nombre de filtres posés — l'interface s'en sert pour son compteur. */
export function countActiveFilters(filters: RestaurantFilters): number {
  return (
    (filters.priceMax === null ? 0 : 1) + filters.tags.length + (filters.withinKm === null ? 0 : 1)
  )
}

/**
 * Libellé d'un rayon proposé : « 500 m » en dessous du kilomètre, « 2 km »
 * au-dessus. À ne pas confondre avec `distanceLabel` de `lib/maps`, qui dit la
 * distance *mesurée* d'un resto — ici on nomme un choix, pas une mesure.
 */
export function radiusLabel(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km} km`
}
