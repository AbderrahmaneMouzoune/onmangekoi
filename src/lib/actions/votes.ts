'use server'

import { createServerClient } from '@/data-access/supabase/server'
import { submitVote } from '@/data-access/votes'
import { omkCode, toUserMessage } from '@/lib/errors'
import { SubmitVoteSchema } from '@/lib/schemas/vote'

import type { ActionResult } from './types'

export type SubmitVoteOutcome = {
  /** Le vote a été pris en compte (ou existait déjà à l'identique) */
  recorded: boolean
  /** Le participant a terminé tous ses votes */
  finished: boolean
  /** Le restaurant avait déjà un vote différent : on passe au suivant */
  skipped: boolean
}

export async function submitVoteAction(input: unknown): Promise<ActionResult<SubmitVoteOutcome>> {
  const parsed = SubmitVoteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Vote invalide' }

  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Non authentifié' }

  try {
    await submitVote(supabase, parsed.data)
  } catch (error) {
    const code = omkCode(error)
    if (code === 'already_voted') {
      return { ok: true, data: { recorded: false, finished: false, skipped: true } }
    }
    if (code === 'already_finished') {
      return { ok: true, data: { recorded: false, finished: true, skipped: false } }
    }
    return { ok: false, error: toUserMessage(error) }
  }

  const { data: participant } = await supabase
    .from('session_participants')
    .select('has_finished_voting')
    .eq('session_id', parsed.data.sessionId)
    .eq('profile_id', user.id)
    .maybeSingle()

  return {
    ok: true,
    data: {
      recorded: true,
      finished: participant?.has_finished_voting ?? false,
      skipped: false,
    },
  }
}
