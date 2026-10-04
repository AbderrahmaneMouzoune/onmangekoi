import { z } from 'zod'

import { omkMessage } from '@/domain/errors'

export const GROUP_NAME_MAX = 60
/** Groupes invitables en une création de session (garde-fou d'interface). */
export const GROUPS_PER_SESSION_MAX = 5

export const GroupNameSchema = z
  .string()
  .trim()
  .min(1, omkMessage('group_name_required'))
  .max(GROUP_NAME_MAX, omkMessage('group_name_too_long'))

export const CreateGroupSchema = z.object({
  name: GroupNameSchema,
  sessionId: z.uuid(),
})

export const RenameGroupSchema = z.object({
  groupId: z.uuid(),
  name: GroupNameSchema,
})

export const GroupIdSchema = z.uuid()

export type CreateGroupInput = z.infer<typeof CreateGroupSchema>
export type RenameGroupInput = z.infer<typeof RenameGroupSchema>
