'use server'

import { getCurrentUser } from '@/data-access/auth'
import { createServerClient } from '@/data-access/supabase/server'
import { toUserMessage } from '@/domain/errors'
import { SubmitVoteSchema } from '@/domain/schemas/vote'
import { submitVoteUseCase } from '@/use-cases/submit-vote'

import type { ActionResult } from './types'
import type { SubmitVoteOutcome } from '@/use-cases/submit-vote'

export async function submitVoteAction(input: unknown): Promise<ActionResult<SubmitVoteOutcome>> {
  const parsed = SubmitVoteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Vote invalide' }

  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (!user) return { ok: false, error: 'Non authentifié' }

  try {
    const outcome = await submitVoteUseCase(supabase, user.id, parsed.data)
    return { ok: true, data: outcome }
  } catch (error) {
    return { ok: false, error: toUserMessage(error) }
  }
}
