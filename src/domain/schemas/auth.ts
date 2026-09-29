import { z } from 'zod'

import { OAUTH_INTENTS, OAUTH_PROVIDERS, splitProviderList } from '@/domain/oauth'

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

export const OAuthProviderSchema = z.enum(OAUTH_PROVIDERS, 'Fournisseur de connexion inconnu')

/**
 * Liste des fournisseurs activés sur un déploiement (`google,apple`). Absente,
 * aucun bouton ne s'affiche ; une valeur inconnue fait échouer le démarrage
 * plutôt que de masquer silencieusement un bouton mal orthographié.
 */
export const OAuthProvidersSchema = z
  .string()
  .optional()
  .transform(splitProviderList)
  .pipe(z.array(OAuthProviderSchema))

export const OAuthStartSchema = z.object({
  provider: OAuthProviderSchema,
  intent: z.enum(OAUTH_INTENTS),
  next: z.string().optional(),
})
