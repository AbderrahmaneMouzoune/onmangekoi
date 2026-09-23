/**
 * Traduction des erreurs métier levées en base (`raise exception 'omk:<code>'`)
 * vers des messages utilisateur. Tout message non préfixé est traité comme
 * une erreur technique et remplacé par un libellé générique : on n'expose
 * jamais un message Postgres brut.
 */

export const OMK_MESSAGES: Record<string, string> = {
  not_authenticated: 'Tu dois choisir un pseudo pour continuer.',
  profile_incomplete: 'Choisis d’abord un pseudo.',
  invalid_name: 'Le nom doit faire entre 1 et 100 caractères.',
  no_restaurants: 'Ajoute au moins un restaurant.',
  too_many_restaurants: 'Une session ne peut pas dépasser 100 restaurants.',
  invalid_identifier: 'Ce code ou ce lien n’a pas le bon format.',
  session_not_found: 'Aucune session ne correspond à ce code.',
  session_started: 'Le vote a déjà démarré, il n’est plus possible de rejoindre.',
  session_closed: 'Cette session est terminée.',
  session_not_closed: 'Le classement n’existe pas encore : clôture d’abord la session.',
  session_already_started: 'La session a déjà été lancée.',
  session_not_voting: 'Le vote n’est pas en cours.',
  deadline_too_soon: 'Choisis une échéance dans au moins une minute.',
  deadline_too_far: 'Une échéance ne peut pas dépasser 12 heures.',
  deadline_passed: 'L’échéance est dépassée : prolonge-la avant de lancer le vote.',
  no_deadline: 'Cette session n’a pas d’échéance à prolonger.',
  invalid_extension: 'Cette prolongation n’est pas valide.',
  not_enough_participants: 'Il faut au moins 2 participants pour lancer le vote.',
  not_enough_restaurants:
    'Il faut au moins 2 restaurants pour lancer le vote : avec un seul, il n’y a rien à départager.',
  host_only: 'Seul le host peut faire ça.',
  not_participant: 'Tu ne fais pas partie de cette session.',
  not_your_restaurant: 'Tu ne peux retirer que les restos que tu as ajoutés.',
  already_finished: 'Tu as déjà terminé de voter.',
  already_voted: 'Tu as déjà voté pour ce restaurant.',
  invalid_vote: 'Ce vote n’est pas valide.',
  invalid_restaurant: 'Ce restaurant ne fait pas partie de la session.',
  invalid_restaurant_name: 'Le nom du restaurant doit faire entre 2 et 100 caractères.',
  invalid_price_level: 'Le budget doit être compris entre 1 et 4.',
  invalid_tags: 'Ce régime alimentaire n’existe pas.',
  invalid_place: 'Ce lieu Google n’est pas exploitable.',
  superlike_used: 'Tu as déjà utilisé ton coup de cœur.',
  super_dislike_used: 'Tu as déjà utilisé ton veto.',
  list_not_found: 'Cette liste n’existe pas ou le lien est invalide.',
  list_not_collaborative: 'Cette liste n’est pas collaborative.',
  invalid_group_name: 'Le nom du groupe doit faire entre 1 et 60 caractères.',
  group_not_found: 'Ce groupe n’existe pas ou tu n’en fais plus partie.',
  group_name_taken: 'Tu as déjà un groupe qui porte ce nom.',
  too_many_groups: 'Tu as atteint la limite de 20 groupes.',
  too_many_invitations: 'Cette session ne peut pas dépasser 50 invitations en attente.',
  group_owner_cannot_leave: 'Tu es le propriétaire de ce groupe : supprime-le pour t’en défaire.',
}

export const GENERIC_ERROR = 'Une erreur est survenue. Réessaie dans un instant.'

const OMK_PREFIX = 'omk:'

export function omkCode(error: unknown): string | null {
  const message = extractMessage(error)
  if (!message || !message.startsWith(OMK_PREFIX)) return null
  return message.slice(OMK_PREFIX.length).trim()
}

export function toUserMessage(error: unknown, fallback = GENERIC_ERROR): string {
  const code = omkCode(error)
  if (code && OMK_MESSAGES[code]) return OMK_MESSAGES[code]
  return fallback
}

function extractMessage(error: unknown): string | null {
  if (!error) return null
  if (typeof error === 'string') return error
  if (typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    return typeof message === 'string' ? message : null
  }
  return null
}

/** Erreur métier côté application, déjà traduite. */
export class AppError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AppError'
  }
}
