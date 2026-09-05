'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { createServerClient } from '@/data-access/supabase/server'
import { toUserMessage } from '@/domain/errors'
import { deleteAccountUseCase } from '@/use-cases/delete-account'

import type { ActionResult } from './types'

/**
 * Suppression du compte. En cas d'échec on ne redirige pas : la page affiche
 * l'erreur, le compte est encore utilisable.
 */
export async function deleteAccountAction(): Promise<ActionResult> {
  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (!user) return { ok: false, error: 'Non authentifié' }

  try {
    await deleteAccountUseCase(supabase)
  } catch (error) {
    return { ok: false, error: toUserMessage(error, 'Impossible de supprimer le compte.') }
  }

  revalidatePath(router.home(), 'layout')
  redirect(router.home())
}
