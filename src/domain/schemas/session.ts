import { z } from 'zod'

export const SESSION_NAME_MAX = 100
export const SESSION_RESTAURANTS_MAX = 100
/** Un seul resto ne se départage pas : le vote n'aurait rien à trancher. */
export const SESSION_RESTAURANTS_MIN = 2

export const CreateSessionSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Donne un nom à la session')
      .max(SESSION_NAME_MAX, `Le nom ne peut pas dépasser ${SESSION_NAME_MAX} caractères`),
    listIds: z.array(z.uuid()).default([]),
    restaurantIds: z.array(z.uuid()).default([]),
  })
  // Une liste peut à elle seule fournir les deux restos : le compte exact ne
  // se connaît qu'après résolution, côté use-case. Ici on écarte le vide.
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
