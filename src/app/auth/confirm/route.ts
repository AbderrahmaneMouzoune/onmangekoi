import { redirect } from 'next/navigation'

import { createServerClient } from '@/data-access/supabase/server'
import { sanitizeNextPath } from '@/lib/routing'

import type { EmailOtpType } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'

/**
 * Cible des liens envoyés par Supabase Auth (confirmation d'email, changement
 * d'email, réinitialisation). Vérifie le `token_hash` puis redirige vers `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = sanitizeNextPath(searchParams.get('next'), '/account')

  if (!tokenHash || !type) {
    redirect('/account?auth=invalid')
  }

  const supabase = await createServerClient()
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })

  if (error) {
    redirect('/account?auth=expired')
  }

  redirect(next)
}
