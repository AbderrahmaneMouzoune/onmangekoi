'use server'

import { getCurrentUser } from '@/data-access/auth'
import { createServerClient } from '@/data-access/supabase/server'
import { SubmitVoteSchema } from '@/domain/schemas/vote'
import { errorMessage, translateError } from '@/i18n/server'
import { submitVoteUseCase } from '@/use-cases/submit-vote'

import type { ActionResult } from './types'
import type { SubmitVoteOutcome } from '@/use-cases/submit-vote'

export async function submitVoteAction(input: unknown): Promise<ActionResult<SubmitVoteOutcome>> {
  const parsed = SubmitVoteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: await errorMessage('invalid_vote') }

  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (!user) return { ok: false, error: await errorMessage('not_authenticated') }

  try {
    const outcome = await submitVoteUseCase(supabase, user.id, parsed.data)
    return { ok: true, data: outcome }
  } catch (error) {
    return { ok: false, error: await translateError(error) }
  }
}
