'use server'

import { z } from 'zod'

import { router } from '@/config/router.config'
import { createApiToken, revokeApiToken, type CreatedApiToken } from '@/data-access/ai-tokens'
import { getCurrentUser } from '@/data-access/auth'
import { createServerClient } from '@/data-access/supabase/server'
import { errorMessage, revalidateLocalizedPath, translateError } from '@/i18n/server'

import type { ActionResult } from './types'

const LabelSchema = z.string().trim().max(60).default('')

/**
 * Crée un jeton d'accès IA. Le jeton en clair ne sort qu'ici, une seule fois :
 * la base n'en garde que l'empreinte.
 */
export async function createApiTokenAction(label: string): Promise<ActionResult<CreatedApiToken>> {
  const parsed = LabelSchema.safeParse(label)
  if (!parsed.success) return { ok: false, error: await errorMessage('invalid_request') }

  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (!user) return { ok: false, error: await errorMessage('not_authenticated') }

  try {
    const token = await createApiToken(supabase, parsed.data)
    revalidateLocalizedPath(router.account())
    return { ok: true, data: token }
  } catch (error) {
    return { ok: false, error: await translateError(error) }
  }
}

/** Révoque un jeton : l'IA qui s'en servait perd l'accès sur-le-champ. */
export async function revokeApiTokenAction(tokenId: string): Promise<ActionResult> {
  const parsed = z.uuid().safeParse(tokenId)
  if (!parsed.success) return { ok: false, error: await errorMessage('invalid_request') }

  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (!user) return { ok: false, error: await errorMessage('not_authenticated') }

  try {
    await revokeApiToken(supabase, parsed.data)
    revalidateLocalizedPath(router.account())
    return { ok: true, data: undefined }
  } catch (error) {
    return { ok: false, error: await translateError(error) }
  }
}
