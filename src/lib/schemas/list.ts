import { z } from 'zod'

export const LIST_NAME_MAX = 60

export const ListNameSchema = z
  .string()
  .trim()
  .min(1, 'Donne un nom à la liste')
  .max(LIST_NAME_MAX, `Le nom ne peut pas dépasser ${LIST_NAME_MAX} caractères`)

export const CreateListSchema = z.object({
  name: ListNameSchema,
  restaurantIds: z.array(z.uuid()).default([]),
})

export const UpdateListSchema = z.object({
  listId: z.uuid(),
  name: ListNameSchema.optional(),
  isCollaborative: z.boolean().optional(),
})

export const ListRestaurantSchema = z.object({
  listId: z.uuid(),
  restaurantId: z.uuid(),
})

export const SharedListActionSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(/^[a-f0-9]{32}$/i, 'Lien invalide'),
  restaurantId: z.uuid().optional(),
  name: ListNameSchema.optional(),
})

export type CreateListInput = z.infer<typeof CreateListSchema>
export type UpdateListInput = z.infer<typeof UpdateListSchema>
