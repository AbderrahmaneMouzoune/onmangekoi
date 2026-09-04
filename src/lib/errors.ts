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
  session_already_started: 'La session a déjà été lancée.',
  session_not_voting: 'Le vote n’est pas en cours.',
  not_enough_participants: 'Il faut au moins 2 participants pour lancer le vote.',
  host_only: 'Seul le host peut faire ça.',
  not_participant: 'Tu ne fais pas partie de cette session.',
  already_finished: 'Tu as déjà terminé de voter.',
  already_voted: 'Tu as déjà voté pour ce restaurant.',
  invalid_vote: 'Ce vote n’est pas valide.',
  invalid_restaurant: 'Ce restaurant ne fait pas partie de la session.',
  superlike_used: 'Tu as déjà utilisé ton coup de cœur.',
  super_dislike_used: 'Tu as déjà utilisé ton veto.',
  list_not_found: 'Cette liste n’existe pas ou le lien est invalide.',
  list_not_collaborative: 'Cette liste n’est pas collaborative.',
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
