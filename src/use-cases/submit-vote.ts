import { getSessionClosure, hasFinishedVoting } from '@/data-access/sessions'
import { submitVote } from '@/data-access/votes'
import { isAgreementVote } from '@/domain/duo'
import { omkCode } from '@/domain/errors'
import { isDuoSession, parseSessionRules } from '@/domain/session-rules'

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
  /**
   * Ce vote vient de sceller l'accord d'un duo (#61) : la session est close,
   * la décision posée. Le deck s'arrête et le résultat prend le relais.
   */
  agreed: boolean
}

/**
 * Le bulletin qu'on vient d'écrire a-t-il fermé un duo sur un accord ? Seul
 * un « ça me va » ou un coup de cœur le peut : les autres votes n'ont rien à
 * relire.
 */
async function sealedAgreement(
  supabase: SupabaseClient<Database>,
  input: SubmitVoteInput
): Promise<boolean> {
  if (!isAgreementVote(input.value)) return false
  const session = await getSessionClosure(supabase, input.sessionId)
  return (
    session !== null &&
    session.status === 'closed' &&
    session.decided_restaurant_id !== null &&
    isDuoSession(parseSessionRules(session.rules))
  )
}

/**
 * Enregistre un vote et renvoie ce que le deck doit faire ensuite.
 * Trois refus de la base ne sont pas des erreurs côté produit : une carte déjà
 * votée (retour arrière, resync Realtime), un participant déjà arrivé au bout,
 * et une session qui vient de se clôturer sous ses doigts — ce que le seuil de
 * clôture rend courant dès qu'il descend sous 100 %, et l'accord d'un duo
 * trouvé par l'autre. Dans les deux derniers cas, le deck s'arrête et l'écran
 * suivant prend le relais.
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
    if (code === 'already_voted') {
      return { recorded: false, finished: false, skipped: true, agreed: false }
    }
    if (code === 'already_finished' || code === 'session_not_voting') {
      return { recorded: false, finished: true, skipped: false, agreed: false }
    }
    throw error
  }

  // Le vote est écrit : si une relecture échoue, on ne le fait pas passer
  // pour un échec — le prochain rendu, ou l'événement Realtime de la
  // clôture, resynchronisera. Les deux lectures partent ensemble.
  const [finished, agreed] = await Promise.all([
    hasFinishedVoting(supabase, input.sessionId, userId).catch(() => false),
    sealedAgreement(supabase, input).catch(() => false),
  ])

  return { recorded: true, finished, skipped: false, agreed }
}
