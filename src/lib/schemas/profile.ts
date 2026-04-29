import { z } from 'zod'

export const UpdatePseudoSchema = z.object({
  pseudo: z
    .string()
    .min(2, 'Le pseudo doit faire au moins 2 caractères')
    .max(30, 'Le pseudo ne peut pas dépasser 30 caractères')
    .regex(/^[a-zA-Z0-9_\-\u00C0-\u024F ]+$/, 'Caractères non autorisés dans le pseudo'),
})

export type UpdatePseudoInput = z.infer<typeof UpdatePseudoSchema>
