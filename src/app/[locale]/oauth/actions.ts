'use server'

import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { consentDecisionSchema, oauthClientIdSchema } from '@/components/account/oauth'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { createServerClient } from '@/data-access/supabase/server'
import { errorMessage, revalidateLocalizedPath } from '@/i18n/server'

import type { ActionResult, FormState } from '@/actions/types'

/**
 * Réponse à une demande d'autorisation OAuth (écran `/oauth/consent`).
 *
 * Le bouton cliqué porte la décision (`name="decision"`). Supabase renvoie
 * dans les deux cas l'URL de retour du client — avec le code d'autorisation,
 * ou avec `error=access_denied` — vers laquelle on redirige : c'est une URL
 * externe, que `redirect()` sait suivre depuis une Server Action (navigation
 * complète côté client). `skipBrowserRedirect` est sans effet côté serveur,
 * mais on le pose pour ne jamais dépendre de ce comportement par défaut.
 */
export async function decideAuthorizationAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const t = await getTranslations('oauth.consent.errors')
  const parsed = consentDecisionSchema.safeParse({
    authorization_id: formData.get('authorization_id'),
    decision: formData.get('decision'),
  })
  if (!parsed.success) return { error: t('decisionFailed') }

  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (!user) return { error: await errorMessage('not_authenticated') }

  const { authorization_id: id, decision } = parsed.data
  const { data, error } =
    decision === 'approve'
      ? await supabase.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true })
  if (error || !data?.redirect_url) return { error: t('decisionFailed') }

  // Une app de plus (ou de moins) dans la section « Apps connectées ».
  if (decision === 'approve') revalidateLocalizedPath(router.account())
  redirect(data.redirect_url)
}

/**
 * Déconnexion d'une app depuis la page compte. Supabase révoque le
 * consentement, supprime les sessions de ce client et invalide ses jetons de
 * rafraîchissement : l'assistant devra redemander l'accès.
 */
export async function revokeOAuthGrantAction(clientId: string): Promise<ActionResult> {
  const t = await getTranslations('oauth.connectedApps')
  const parsed = oauthClientIdSchema.safeParse(clientId)
  if (!parsed.success) return { ok: false, error: t('disconnectFailed') }

  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (!user) return { ok: false, error: await errorMessage('not_authenticated') }

  const { error } = await supabase.auth.oauth.revokeGrant({ clientId: parsed.data })
  if (error) return { ok: false, error: t('disconnectFailed') }

  revalidateLocalizedPath(router.account())
  return { ok: true, data: undefined }
}
