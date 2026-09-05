import { z } from 'zod'

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Adresse email trop longue')
  .pipe(z.email('Adresse email invalide'))

export const PasswordSchema = z
  .string()
  .min(8, 'Le mot de passe doit faire au moins 8 caractères')
  .max(72, 'Le mot de passe est trop long')

export const LinkEmailSchema = z.object({
  email: EmailSchema,
})

export const SetPasswordSchema = z
  .object({
    password: PasswordSchema,
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    message: 'Les deux mots de passe ne correspondent pas',
    path: ['confirm'],
  })

export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, 'Mot de passe requis'),
  next: z.string().optional(),
})

export type LoginInput = z.infer<typeof LoginSchema>
