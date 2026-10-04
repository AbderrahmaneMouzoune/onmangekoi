import { z } from 'zod'

import { omkMessage } from '@/domain/errors'

export const PSEUDO_MIN = 2
export const PSEUDO_MAX = 30

export const PseudoSchema = z
  .string()
  .trim()
  .min(PSEUDO_MIN, omkMessage('pseudo_too_short'))
  .max(PSEUDO_MAX, omkMessage('pseudo_too_long'))
  .regex(/^[\p{L}\p{N}_\- ]+$/u, omkMessage('pseudo_invalid_chars'))

export const SetupProfileSchema = z.object({
  pseudo: PseudoSchema,
  next: z.string().optional(),
})

export const UpdatePseudoSchema = z.object({
  pseudo: PseudoSchema,
})

export type SetupProfileInput = z.infer<typeof SetupProfileSchema>
export type UpdatePseudoInput = z.infer<typeof UpdatePseudoSchema>
