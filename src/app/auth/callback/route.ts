import { redirect } from 'next/navigation'

import { getProfile } from '@/data-access/profile'
import { createServerClient } from '@/data-access/supabase/server'
import {
  oauthDefaultNext,
  oauthFailureFromCallback,
  oauthFailureFromCode,
  oauthFailurePath,
  oauthSuccessPath,
  parseOAuthIntent,
} from '@/domain/oauth'
import { sanitizeNextPath } from '@/lib/routing'

import type { NextRequest } from 'next/server'

/**
 * Retour d'un fournisseur OAuth (Google, Apple), relayé par Supabase Auth.
 *
 * En cas de succès, l'URL porte un `code` à échanger contre une session
 * (PKCE : le `code_verifier` attend en cookie depuis `startOAuthAction`).
 * En cas d'échec, Supabase pose `error`, `error_code` et `error_description`
 * — dont `identity_already_exists` quand l'identité appartient déjà à un autre
 * compte — que l'on ramène à un code `omk:` traduit sur la page de départ.
 *
 * `next` n'est jamais suivi tel quel : `sanitizeNextPath` n'accepte qu'un
 * chemin interne, pas d'open redirect.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const intent = parseOAuthIntent(searchParams.get('intent'))
  const next = sanitizeNextPath(searchParams.get('next'), oauthDefaultNext(intent))

  const failure = oauthFailureFromCallback({
    error: searchParams.get('error'),
    error_code: searchParams.get('error_code'),
    error_description: searchParams.get('error_description'),
  })
  if (failure) redirect(oauthFailurePath(intent, next, failure))

  const code = searchParams.get('code')
  if (!code) redirect(oauthFailurePath(intent, next, 'oauth_failed'))

  const supabase = await createServerClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.user) {
    redirect(oauthFailurePath(intent, next, oauthFailureFromCode(error?.code)))
  }

  // Une reconnexion n'a besoin du profil que pour repérer un compte tout neuf.
  // Une lecture en échec ne doit pas annuler une connexion qui a réussi.
  const profile =
    intent === 'login' ? await getProfile(supabase, data.user.id).catch(() => undefined) : undefined
  const isNewAccount = profile !== undefined && !profile?.pseudo

  redirect(oauthSuccessPath(intent, next, { isNewAccount }))
}
