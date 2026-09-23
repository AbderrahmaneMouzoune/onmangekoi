/**
 * Anti-fatigue : ce qui a déjà gagné récemment.
 *
 * Quand le même restaurant remporte trois vendredis d'affilée, le vote devient
 * une formalité. On ne l'interdit pas — on le dit : un badge au moment de
 * choisir les restaurants, une mention discrète sur la carte de vote, et une
 * case à cocher pour écarter d'un coup les gagnants du dernier mois.
 *
 * Tout ce qui sort d'ici vient de `recent_winners()` : le gagnant d'une
 * session close, jamais le détail des votes.
 */
import { relativeDate } from '@/lib/format'

import type { RecentWinner } from '@/data-access/models'

/**
 * Fenêtre pendant laquelle un restaurant gagnant reste « récent ».
 *
 * La base a le même chiffre dans `recent_winners_window()` et c'est elle qui
 * fait foi : la constante ne sert qu'à l'écrire aux gens. Les deux doivent
 * changer ensemble — le scénario `supabase/tests/recent-winners.test.sql`
 * fige la valeur en base.
 */
export const RECENT_WINNER_WINDOW_DAYS = 30

/**
 * Date du dernier sacre, par identifiant de restaurant.
 *
 * Un objet plat plutôt qu'une `Map` : il traverse tel quel la frontière
 * serveur → client, et une lecture par clé reste une lecture — là où un
 * `map.get()` dans l'arbre de rendu empêche le compilateur React de mémoïser
 * ce qui l'entoure. Les clés sont des uuid de `restaurants`, jamais une
 * chaîne venue d'ailleurs : rien n'y entre en collision avec `Object`.
 */
export type RecentWinnerDates = Readonly<Record<string, string>>

export const NO_RECENT_WINNERS: RecentWinnerDates = {}

export function recentWinnerDates(rows: readonly RecentWinner[]): RecentWinnerDates {
  return Object.fromEntries(rows.map((row) => [row.restaurant_id, row.last_won_at]))
}

/** Combien de restaurants ont gagné récemment. */
export function recentWinnerCount(recent: RecentWinnerDates): number {
  return Object.keys(recent).length
}

/** « Gagnant il y a 6 jours » — au moment de choisir les restaurants. */
export function recentWinLabel(iso: string, now: Date = new Date()): string {
  return `Gagnant ${relativeDate(iso, now)}`
}

const dayAndMonth = new Intl.DateTimeFormat('fr', { day: 'numeric', month: 'long' })

/**
 * « Déjà gagnant le 28 août » — sur la carte de vote, où une date arrête
 * mieux l'œil qu'un décompte de jours.
 *
 * La base ne sait pas que le groupe y est allé, seulement que ce restaurant a
 * gagné : le libellé s'en tient à ce qui est vrai.
 */
export function lastWinLabel(iso: string): string {
  return `Déjà gagnant le ${dayAndMonth.format(new Date(iso))}`
}

/** Retire les gagnants récents d'une sélection, sans en changer l'ordre. */
export function withoutRecentWinners(
  restaurantIds: readonly string[],
  recent: RecentWinnerDates
): string[] {
  return restaurantIds.filter((id) => recent[id] === undefined)
}
