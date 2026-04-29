import { z } from 'zod'

export const CreateSessionSchema = z
  .object({
    name: z.string().min(1, 'Le nom est requis').max(100, 'Le nom est trop long'),
    listIds: z.array(z.string().uuid()).default([]),
    restaurantIds: z.array(z.string().uuid()).default([]),
  })
  .refine((data) => data.listIds.length + data.restaurantIds.length > 0, {
    message: 'Sélectionne au moins une liste ou un restaurant',
  })

export const JoinSessionSchema = z.object({
  identifier: z.string().min(1, 'Code ou lien requis').max(500),
})

export type CreateSessionInput = z.infer<typeof CreateSessionSchema>
export type JoinSessionInput = z.infer<typeof JoinSessionSchema>
