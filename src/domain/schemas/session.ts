import { z } from 'zod'

import { DEADLINE_MAX_MINUTES, DEADLINE_MIN_MINUTES } from '@/domain/session-deadline'

export const SESSION_NAME_MAX = 100
export const SESSION_RESTAURANTS_MAX = 100

/** Un champ absent du formulaire vaut `null` ; un champ vidé, la chaîne vide. */
const absent = (value: unknown) =>
  value === null || (typeof value === 'string' && value.trim() === '') ? undefined : value

export const CreateSessionSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Donne un nom à la session')
      .max(SESSION_NAME_MAX, `Le nom ne peut pas dépasser ${SESSION_NAME_MAX} caractères`),
    listIds: z.array(z.uuid()).default([]),
    restaurantIds: z.array(z.uuid()).default([]),
    /** « dans 10 min » : la durée est résolue côté serveur, sur son horloge. */
    closesInMinutes: z.preprocess(
      absent,
      z.coerce
        .number()
        .int()
        .min(DEADLINE_MIN_MINUTES, 'Choisis une échéance dans au moins une minute')
        .max(DEADLINE_MAX_MINUTES, 'Une échéance ne peut pas dépasser 12 heures')
        .optional()
    ),
    /** « à 12:00 » : l'instant est calculé par le navigateur, seul à connaître son fuseau. */
    closesAt: z.preprocess(absent, z.iso.datetime().optional()),
  })
  .refine((data) => data.listIds.length + data.restaurantIds.length > 0, {
    message: 'Sélectionne au moins une liste ou un restaurant',
    path: ['restaurantIds'],
  })

export const JoinSessionSchema = z.object({
  identifier: z.string().trim().min(1, 'Entre un code ou colle un lien').max(500),
})

export const SessionIdSchema = z.uuid()

export type CreateSessionInput = z.infer<typeof CreateSessionSchema>
export type JoinSessionInput = z.infer<typeof JoinSessionSchema>
