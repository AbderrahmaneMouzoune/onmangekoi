import { z } from 'zod'

import { omkMessage } from '@/domain/errors'
import { GROUPS_PER_SESSION_MAX } from '@/domain/schemas/group'
import { DEADLINE_MAX_MINUTES, DEADLINE_MIN_MINUTES } from '@/domain/session-deadline'
import { CLOSE_AT_RATIO_MIN, JOKERS_MAX } from '@/domain/session-rules'

export const SESSION_NAME_MAX = 100
export const SESSION_RESTAURANTS_MAX = 100

/** Un champ absent du formulaire vaut `null` ; un champ vidé, la chaîne vide. */
const absent = (value: unknown) =>
  value === null || (typeof value === 'string' && value.trim() === '') ? undefined : value

/**
 * Chaque message de validation est un code (`omkMessage`), traduit par
 * l'action (`translateIssue`) — dans la langue de la personne, et avec le
 * même texte que le refus de la base quand elle dit la même chose. Les
 * libellés portent les bornes en clair : 100, 12 heures, 5 jokers.
 */
export const CreateSessionSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, omkMessage('session_name_required'))
      .max(SESSION_NAME_MAX, omkMessage('session_name_too_long')),
    listIds: z.array(z.uuid()).default([]),
    restaurantIds: z.array(z.uuid()).default([]),
    /** Groupes récurrents à pré-inviter — des invitations, pas des participants. */
    groupIds: z.array(z.uuid()).max(GROUPS_PER_SESSION_MAX).default([]),
    /** « dans 10 min » : la durée est résolue côté serveur, sur son horloge. */
    closesInMinutes: z.preprocess(
      absent,
      z.coerce
        .number()
        .int()
        .min(DEADLINE_MIN_MINUTES, omkMessage('deadline_too_soon'))
        .max(DEADLINE_MAX_MINUTES, omkMessage('deadline_too_far'))
        .optional()
    ),
    /** « à 12:00 » : l'instant est calculé par le navigateur, seul à connaître son fuseau. */
    closesAt: z.preprocess(absent, z.iso.datetime().optional()),
    /**
     * Règles du vote. Absentes, ce sont celles d'avant — la base porte les
     * mêmes bornes (`public.rules_are_valid`) et tranche en dernier.
     */
    superlikes: z.preprocess(
      absent,
      z.coerce
        .number()
        .int()
        .min(0, omkMessage('jokers_negative'))
        .max(JOKERS_MAX, omkMessage('jokers_too_many'))
        .optional()
    ),
    vetos: z.preprocess(
      absent,
      z.coerce
        .number()
        .int()
        .min(0, omkMessage('jokers_negative'))
        .max(JOKERS_MAX, omkMessage('jokers_too_many'))
        .optional()
    ),
    closeAtRatio: z.preprocess(
      absent,
      z.coerce
        .number()
        .min(CLOSE_AT_RATIO_MIN, omkMessage('close_ratio_too_low'))
        .max(1, omkMessage('close_ratio_too_high'))
        .optional()
    ),
    /**
     * Session ouverte (#58) : pas de salle d'attente, on rejoint pendant le
     * vote. Case à cocher, comme l'anti-fatigue : absente, c'est non.
     */
    open: z.coerce.boolean().optional(),
    /**
     * Mode duo (#61) : deux places, pas de salle d'attente, le premier accord
     * décide. Posé par la page `/duo`, jamais par le formulaire complet.
     */
    duo: z.coerce.boolean().optional(),
    /**
     * Anti-fatigue. Une case décochée n'envoie rien du tout : le `null` que
     * rend `formData.get` se lit comme un non, et l'absence du champ aussi.
     */
    excludeRecentWinners: z.coerce.boolean().optional(),
  })
  .refine((data) => data.listIds.length + data.restaurantIds.length > 0, {
    message: omkMessage('nothing_selected'),
    path: ['restaurantIds'],
  })
  // Sans échéance, une session ouverte ne se fermerait jamais. La base refuse
  // aussi (`omk:open_session_needs_deadline`) ; dire non ici épargne un
  // aller-retour, avec le même message (le même code, traduit par l'action).
  .refine((data) => !data.open || data.closesInMinutes != null || data.closesAt != null, {
    message: omkMessage('open_session_needs_deadline'),
    path: ['closesInMinutes'],
  })
  // Deux places d'un côté, la porte ouverte jusqu'à l'échéance de l'autre. La
  // base refuse aussi la combinaison (`omk:invalid_rules`).
  .refine((data) => !(data.open && data.duo), {
    message: omkMessage('duo_cannot_be_open'),
    path: ['duo'],
  })

export const JoinSessionSchema = z.object({
  identifier: z.string().trim().min(1, omkMessage('identifier_required')).max(500),
})

export const SessionIdSchema = z.uuid()

/** Restaurants apportés à une session en attente, par n'importe quel participant. */
export const AddSessionRestaurantsSchema = z.object({
  sessionId: z.uuid(),
  restaurantIds: z
    .array(z.uuid())
    .min(1, omkMessage('no_restaurant_selected'))
    .max(SESSION_RESTAURANTS_MAX),
})

export const SessionRestaurantSchema = z.object({
  sessionId: z.uuid(),
  restaurantId: z.uuid(),
})

export type AddSessionRestaurantsInput = z.infer<typeof AddSessionRestaurantsSchema>
export type CreateSessionInput = z.infer<typeof CreateSessionSchema>
export type JoinSessionInput = z.infer<typeof JoinSessionSchema>
