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

/** Code de partage Crockford (10) ou ancien token (32 hex), déjà normalisé. */
export const ShareIdentifierSchema = z
  .string()
  .trim()
  .regex(/^(?:[0-9A-HJKMNP-TV-Z]{10}|[a-f0-9]{32})$/, 'Lien invalide')

export const SharedListActionSchema = z.object({
  identifier: ShareIdentifierSchema,
})

export type CreateListInput = z.infer<typeof CreateListSchema>
export type UpdateListInput = z.infer<typeof UpdateListSchema>
