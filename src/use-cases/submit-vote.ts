import { hasFinishedVoting } from '@/data-access/sessions'
import { submitVote } from '@/data-access/votes'
import { omkCode } from '@/domain/errors'

import type { Database } from '@/data-access/models/database'
import type { SubmitVoteInput } from '@/domain/schemas/vote'
import type { SupabaseClient } from '@supabase/supabase-js'

export type SubmitVoteOutcome = {
  /** Le vote a été pris en compte (ou existait déjà à l'identique) */
  recorded: boolean
  /** Le participant a terminé tous ses votes */
  finished: boolean
  /** Le restaurant avait déjà un vote différent : on passe au suivant */
  skipped: boolean
}

/**
 * Enregistre un vote et renvoie ce que le deck doit faire ensuite.
 * Trois refus de la base ne sont pas des erreurs côté produit : une carte déjà
 * votée (retour arrière, resync Realtime), un participant déjà arrivé au bout,
 * et une session qui vient de se clôturer sous ses doigts — ce que le seuil de
 * clôture rend courant dès qu'il descend sous 100 %. Dans les deux derniers
 * cas, le deck s'arrête et l'écran suivant prend le relais.
 */
export async function submitVoteUseCase(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: SubmitVoteInput
): Promise<SubmitVoteOutcome> {
  try {
    await submitVote(supabase, input)
  } catch (error) {
    const code = omkCode(error)
    if (code === 'already_voted') return { recorded: false, finished: false, skipped: true }
    if (code === 'already_finished' || code === 'session_not_voting') {
      return { recorded: false, finished: true, skipped: false }
    }
    throw error
  }

  // Le vote est écrit : si la relecture du statut échoue, on ne le fait pas
  // passer pour un échec — le prochain rendu resynchronisera.
  const finished = await hasFinishedVoting(supabase, input.sessionId, userId).catch(() => false)

  return { recorded: true, finished, skipped: false }
}
