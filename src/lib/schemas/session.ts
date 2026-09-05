import { z } from 'zod'

export const SESSION_NAME_MAX = 100
export const SESSION_RESTAURANTS_MAX = 100

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
