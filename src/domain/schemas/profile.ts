import { z } from 'zod'

export const PSEUDO_MIN = 2
export const PSEUDO_MAX = 30

export const PseudoSchema = z
  .string()
  .trim()
  .min(PSEUDO_MIN, `Le pseudo doit faire au moins ${PSEUDO_MIN} caractères`)
  .max(PSEUDO_MAX, `Le pseudo ne peut pas dépasser ${PSEUDO_MAX} caractères`)
  .regex(/^[\p{L}\p{N}_\- ]+$/u, 'Lettres, chiffres, espaces, tirets et underscores uniquement')

export const SetupProfileSchema = z.object({
  pseudo: PseudoSchema,
  next: z.string().optional(),
})

export const UpdatePseudoSchema = z.object({
  pseudo: PseudoSchema,
})

export type SetupProfileInput = z.infer<typeof SetupProfileSchema>
export type UpdatePseudoInput = z.infer<typeof UpdatePseudoSchema>
