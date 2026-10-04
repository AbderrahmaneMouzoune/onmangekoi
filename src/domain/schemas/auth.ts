import { z } from 'zod'

import { omkMessage } from '@/domain/errors'

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, omkMessage('email_too_long'))
  .pipe(z.email(omkMessage('invalid_email')))

export const PasswordSchema = z
  .string()
  .min(8, omkMessage('password_too_short'))
  .max(72, omkMessage('password_too_long'))

export const LinkEmailSchema = z.object({
  email: EmailSchema,
})

export const SetPasswordSchema = z
  .object({
    password: PasswordSchema,
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    message: omkMessage('password_mismatch'),
    path: ['confirm'],
  })

export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, omkMessage('password_required')),
  next: z.string().optional(),
})

export type LoginInput = z.infer<typeof LoginSchema>
