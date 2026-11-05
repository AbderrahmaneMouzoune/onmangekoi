import { isSameName, pickMatch } from '@/domain/restaurant-match'

import type {
  McpAddToListResult,
  McpFoundRestaurant,
  McpList,
  McpRestaurant,
} from '@/data-access/mcp'
import type { PlaceResult } from '@/domain/places'

/**
 * « J'ai mangé à La Ba, c'était bon » — en un seul appel.
 *
 * C'est l'outil que l'IA appelle quand quelqu'un lui raconte un resto qu'il a
 * aimé. Il enchaîne ce qu'une personne ferait dans l'app :
 *
 *  1. chercher le resto dans le catalogue (un nom identique, à l'article et
 *     aux accents près, suffit) ;
 *  2. sinon le chercher chez Google, et ne l'importer que si un seul lieu
 *     porte exactement ce nom ;
 *  3. choisir la liste : celle qu'on lui nomme (créée au besoin), la seule
 *     qui existe, ou une liste par défaut s'il n'y en a aucune ;
 *  4. l'y ranger — sans doublon : un resto déjà présent le reste.
 *
 * Dans le doute, il n'agit pas : il rend les candidats, ou les listes, et
 * c'est à l'IA de poser la question. Mieux vaut une question qu'un doublon.
 *
 * Les dépendances sont injectées : le scénario se teste sans base ni Google.
 */

export interface RememberRestaurantDeps {
  findRestaurants: (input: { query: string; city?: string | null }) => Promise<McpFoundRestaurant[]>
  /** Absente quand Google n'est pas configuré : on s'en tient au catalogue. */
  searchPlaces?: (query: string) => Promise<PlaceResult[]>
  importPlace: (placeId: string) => Promise<McpRestaurant>
  lists: () => Promise<McpList[]>
  createList: (name: string) => Promise<McpList>
  addToList: (listId: string, restaurantId: string) => Promise<McpAddToListResult>
}

export interface RememberRestaurantInput {
  name: string
  city?: string | null
  listId?: string | null
  listName?: string | null
  /** Nom de la liste créée quand la personne n'en a encore aucune. */
  defaultListName: string
}

/** Un lieu Google proposé à la personne : de quoi le reconnaître, et son id. */
export interface PlaceCandidate {
  google_place_id: string
  name: string
  address: string | null
  city: string | null
  cuisine_type: string | null
}

export type RememberRestaurantResult =
  | (McpAddToListResult & {
      status: 'added' | 'already_in_list'
      /** D'où vient le resto : déjà connu de l'app, ou importé de Google à l'instant. */
      restaurant_source: 'catalog' | 'google'
      list_created: boolean
    })
  | {
      status: 'ambiguous'
      catalog_candidates: McpFoundRestaurant[]
      google_candidates: PlaceCandidate[]
    }
  | { status: 'choose_list'; lists: McpList[] }
  | { status: 'not_found'; google_searched: boolean }

/** Au-delà, la personne ne lira pas la liste des candidats. */
const MAX_CANDIDATES = 5

function toCandidate(place: PlaceResult): PlaceCandidate {
  return {
    google_place_id: place.placeId,
    name: place.name,
    address: place.address,
    city: place.city,
    cuisine_type: place.cuisineType,
  }
}

type ResolvedRestaurant =
  | { kind: 'catalog'; restaurant: McpFoundRestaurant }
  | { kind: 'google'; place: PlaceResult }
  | Extract<RememberRestaurantResult, { status: 'ambiguous' | 'not_found' }>

async function resolveRestaurant(
  deps: RememberRestaurantDeps,
  name: string,
  city: string | null
): Promise<ResolvedRestaurant> {
  const catalog = await deps.findRestaurants({ query: name, city })
  const fromCatalog = pickMatch(name, catalog, city)
  if (fromCatalog.kind === 'match') return { kind: 'catalog', restaurant: fromCatalog.candidate }

  // Plusieurs homonymes dans le catalogue : Google n'en saura pas plus.
  const homonyms = catalog.filter((restaurant) => isSameName(restaurant.name, name))
  if (homonyms.length > 1) {
    return {
      status: 'ambiguous',
      catalog_candidates: homonyms.slice(0, MAX_CANDIDATES),
      google_candidates: [],
    }
  }

  if (!deps.searchPlaces) {
    return catalog.length > 0
      ? {
          status: 'ambiguous',
          catalog_candidates: catalog.slice(0, MAX_CANDIDATES),
          google_candidates: [],
        }
      : { status: 'not_found', google_searched: false }
  }

  const places = await deps.searchPlaces(city ? `${name} ${city}` : name)
  const fromGoogle = pickMatch(name, places, city)
  if (fromGoogle.kind === 'match') return { kind: 'google', place: fromGoogle.candidate }

  if (catalog.length === 0 && places.length === 0) {
    return { status: 'not_found', google_searched: true }
  }

  return {
    status: 'ambiguous',
    catalog_candidates: catalog.slice(0, MAX_CANDIDATES),
    google_candidates: places.slice(0, MAX_CANDIDATES).map(toCandidate),
  }
}

type ResolvedList =
  { kind: 'list'; list: McpList; created: boolean } | { kind: 'choose'; lists: McpList[] }

async function resolveList(
  deps: RememberRestaurantDeps,
  input: RememberRestaurantInput,
  /** Listes qui contiennent déjà le resto : sans consigne, c'est là qu'il est. */
  alreadyIn: readonly string[]
): Promise<ResolvedList> {
  const lists = await deps.lists()

  if (input.listId) {
    const list = lists.find((candidate) => candidate.id === input.listId)
    // Une liste inconnue : la base dira « introuvable » à l'ajout.
    return { kind: 'list', list: list ?? ({ id: input.listId } as McpList), created: false }
  }

  const listName = input.listName?.trim()
  if (listName) {
    const named = lists.find((candidate) => isSameName(candidate.name, listName))
    if (named) return { kind: 'list', list: named, created: false }
    return { kind: 'list', list: await deps.createList(listName), created: true }
  }

  // Déjà rangé quelque part : on le dit plutôt que de demander où le mettre.
  const home = lists.find((candidate) => alreadyIn.includes(candidate.id))
  if (home) return { kind: 'list', list: home, created: false }

  if (lists.length === 1) return { kind: 'list', list: lists[0], created: false }
  if (lists.length > 1) return { kind: 'choose', lists }
  return { kind: 'list', list: await deps.createList(input.defaultListName), created: true }
}

export async function rememberRestaurantUseCase(
  deps: RememberRestaurantDeps,
  input: RememberRestaurantInput
): Promise<RememberRestaurantResult> {
  const name = input.name.trim()
  const city = input.city?.trim() || null

  const resolved = await resolveRestaurant(deps, name, city)
  if ('status' in resolved) return resolved

  // La liste se choisit avant d'importer quoi que ce soit : une question
  // posée à la personne ne doit rien laisser derrière elle.
  const alreadyIn =
    resolved.kind === 'catalog' ? resolved.restaurant.in_my_lists.map((list) => list.id) : []
  const target = await resolveList(deps, input, alreadyIn)
  if (target.kind === 'choose') return { status: 'choose_list', lists: target.lists }

  const restaurant =
    resolved.kind === 'catalog'
      ? resolved.restaurant
      : await deps.importPlace(resolved.place.placeId)

  const result = await deps.addToList(target.list.id, restaurant.id)
  return {
    ...result,
    status: result.added ? 'added' : 'already_in_list',
    restaurant_source: resolved.kind,
    list_created: target.created,
  }
}
