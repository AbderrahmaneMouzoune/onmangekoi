import { z } from 'zod'

import { omkMessage } from '@/domain/errors'

export const LIST_NAME_MAX = 60

export const ListNameSchema = z
  .string()
  .trim()
  .min(1, omkMessage('list_name_required'))
  .max(LIST_NAME_MAX, omkMessage('list_name_too_long'))

export const CreateListSchema = z.object({
  name: ListNameSchema,
  restaurantIds: z.array(z.uuid()).default([]),
})

export const UpdateListSchema = z.object({
  listId: z.uuid(),
  name: ListNameSchema.optional(),
  isCollaborative: z.boolean().optional(),
  /** Partage public de la liste : page présentable, sitemap, image Open Graph. */
  isPublic: z.boolean().optional(),
})

/** Code de partage Crockford (10) ou ancien token (32 hex), déjà normalisé. */
export const ShareIdentifierSchema = z
  .string()
  .trim()
  .regex(/^(?:[0-9A-HJKMNP-TV-Z]{10}|[a-f0-9]{32})$/, omkMessage('invalid_link'))

export const SharedListActionSchema = z.object({
  identifier: ShareIdentifierSchema,
})

export type CreateListInput = z.infer<typeof CreateListSchema>
export type UpdateListInput = z.infer<typeof UpdateListSchema>
