/**
 * Contraintes alimentaires déclarées par chacun (issue #60).
 *
 * Un veto dépensé pour dire « je ne peux pas manger là » est un joker gâché :
 * ce qu'on ne peut pas manger ne change pas d'un midi à l'autre. Chacun le
 * déclare une fois, depuis `/account`, et l'app le **signale** — jamais ne
 * masque, jamais n'interdit : le host décide.
 *
 * La règle est celle de `public.restaurant_conflicts_with()` en base, qui
 * fait foi pour les comptes par session. Elle est rejouée ici, pure, pour
 * l'écran de composition, où seules ses propres contraintes comptent — les
 * deux sont tenues ensemble par les tests (`food-constraints.test.ts` et
 * `supabase/tests/profile-constraints.test.sql`).
 *
 * Principe : **se taire plutôt que rassurer à tort — ni accuser à tort**.
 * Des `tags` vides veulent dire « on ne sait pas », un `price_level` nul
 * aussi : dans les deux cas, rien n'est signalé.
 */
import { RESTAURANT_TAG_LABELS, type RestaurantTag } from '@/domain/schemas/restaurant'
import { plural } from '@/lib/format'

export interface FoodConstraints {
  /** Régimes exigés, dans l'ordre du catalogue. */
  tags: RestaurantTag[]
  /** Budget maximum, de 1 à 4. `null` : pas de plafond. */
  maxPriceLevel: number | null
}

export const NO_FOOD_CONSTRAINTS: FoodConstraints = { tags: [], maxPriceLevel: null }

/** Ce qu'il faut savoir d'un resto pour appliquer la règle. */
export interface ConstraintSubject {
  tags: string[]
  price_level: number | null
}

/** Pourquoi un resto heurte : un régime qu'il ne sert pas, ou le budget. */
export type ConstraintConflict = RestaurantTag | 'budget'

export function hasFoodConstraints(constraints: FoodConstraints): boolean {
  return constraints.tags.length > 0 || constraints.maxPriceLevel !== null
}

/** Nombre de contraintes posées — un régime compte un, le budget aussi. */
export function countFoodConstraints(constraints: FoodConstraints): number {
  return constraints.tags.length + (constraints.maxPriceLevel === null ? 0 : 1)
}

/** Qui sert vegan sert végétarien : c'est la seule équivalence connue. */
function serves(restaurantTags: string[], wanted: RestaurantTag): boolean {
  return (
    restaurantTags.includes(wanted) || (wanted === 'vegetarian' && restaurantTags.includes('vegan'))
  )
}

/**
 * Les contraintes que ce resto heurte, dans l'ordre des contraintes données,
 * le budget en dernier. Vide quand rien n'est heurté — ou quand on ne sait
 * pas.
 */
export function constraintConflicts(
  restaurant: ConstraintSubject,
  constraints: FoodConstraints
): ConstraintConflict[] {
  const conflicts: ConstraintConflict[] = []
  // Des régimes non renseignés ne heurtent rien : on ne sait pas.
  if (restaurant.tags.length > 0) {
    for (const tag of constraints.tags) {
      if (!serves(restaurant.tags, tag)) conflicts.push(tag)
    }
  }
  if (
    restaurant.price_level !== null &&
    constraints.maxPriceLevel !== null &&
    restaurant.price_level > constraints.maxPriceLevel
  ) {
    conflicts.push('budget')
  }
  return conflicts
}

export function conflictsWith(
  restaurant: ConstraintSubject,
  constraints: FoodConstraints
): boolean {
  return constraintConflicts(restaurant, constraints).length > 0
}

/**
 * Comptes par resto, tels que les rend `session_constraint_conflicts` : un
 * resto absent n'est heurté par personne — ou par personne qu'on sache.
 */
export type ConstraintConflictCounts = Record<string, number>

export const NO_CONFLICTS: ConstraintConflictCounts = {}

export function toConflictCounts(
  rows: { restaurant_id: string; blocked_count: number }[]
): ConstraintConflictCounts {
  const counts: ConstraintConflictCounts = {}
  for (const row of rows) {
    if (row.blocked_count > 0) counts[row.restaurant_id] = row.blocked_count
  }
  return counts
}

/**
 * « 2 participants ne peuvent pas y manger ». Jamais qui, jamais pourquoi :
 * le compte est tout ce que la base accepte de dire des contraintes des
 * autres. `null` quand personne n'est concerné — rien à afficher.
 */
export function blockedLabel(count: number | undefined): string | null {
  if (!count || count <= 0) return null
  return `${count} ${plural(count, 'participant')} ${plural(count, 'ne peut', 'ne peuvent')} pas y manger`
}

/**
 * Le témoin de ses **propres** contraintes, à la composition : « Pas halal »,
 * « Hors budget », ou « Pas pour toi » quand plusieurs se cumulent. Ce sont
 * les siennes, on peut donc les nommer — ce qu'on ne fait jamais pour les
 * autres. `null` : rien à signaler.
 */
export function ownConflictLabel(conflicts: ConstraintConflict[]): string | null {
  const [only, ...rest] = conflicts
  if (only === undefined) return null
  if (rest.length > 0) return 'Pas pour toi'
  if (only === 'budget') return 'Hors budget'
  return `Pas ${RESTAURANT_TAG_LABELS[only].toLowerCase()}`
}
