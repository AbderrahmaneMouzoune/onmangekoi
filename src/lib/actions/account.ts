'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { router } from '@/config/router.config'
import { deleteMyAccount } from '@/data-access/account'
import { getCurrentUser } from '@/data-access/auth'
import { createServerClient } from '@/data-access/supabase/server'
import { toUserMessage } from '@/lib/errors'

import type { ActionResult } from './types'

/**
 * Effacement du compte (art. 17 RGPD). La RPC fait tout le travail en base ;
 * ici on se contente de vider la session locale et de renvoyer la personne à
 * l'accueil. En cas d'échec on ne déconnecte pas : la page peut afficher
 * l'erreur avec le compte encore utilisable.
 */
export async function deleteAccountAction(): Promise<ActionResult> {
  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (!user) return { ok: false, error: 'Non authentifié' }

  try {
    await deleteMyAccount(supabase)
  } catch (error) {
    return { ok: false, error: toUserMessage(error, 'Impossible de supprimer le compte.') }
  }

  await supabase.auth.signOut()
  revalidatePath(router.home(), 'layout')
  redirect(router.home())
}
