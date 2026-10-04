/**
 * Nom proposé à une session : personne n'a à le taper, il sert à la retrouver
 * dans l'historique et à la reconnaître dans une notification. Il dit le
 * repas et le jour — « Déj du mardi », « À deux · dîner du jeudi ».
 *
 * Le domaine ne fait que choisir le repas ; le composant écrit le nom dans la
 * langue de la personne (`session.create.defaultName`, `session.duo.sessionName`).
 */

export type Meal = 'lunch' | 'dinner'

/** Passé cette heure, on ne parle plus du déjeuner. */
const DINNER_FROM_HOUR = 15

/**
 * Le repas que vise une session créée à cet instant. Avec un fuseau, l'heure
 * se lit dans ce fuseau — celui du produit, pour qu'un serveur en UTC ne
 * propose pas un « déj » à 16 h à Paris ; sans, dans celui de la machine.
 */
export function mealAt(now: Date, timeZone?: string): Meal {
  const hour = timeZone
    ? Number(
        new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(
          now
        )
      )
    : now.getHours()
  return hour < DINNER_FROM_HOUR ? 'lunch' : 'dinner'
}
