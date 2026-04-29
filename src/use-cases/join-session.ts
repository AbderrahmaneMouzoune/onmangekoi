import { getSessionByToken, getSessionByCode, upsertParticipant } from '@/data-access/sessions'
import { createServerClient } from '@/data-access/supabase'

import type { Session, SessionParticipant } from '@/data-access/models/database'

export type JoinSessionResult = {
  session: Session
  participant: SessionParticipant
}

/**
 * Rejoint une session via son invite_token (long) ou invite_code (court, 6 chars).
 * L'opération est idempotente : rejoindre deux fois ne crée pas de doublon.
 */
export async function joinSessionUseCase(
  userId: string,
  identifier: string
): Promise<JoinSessionResult> {
  const supabase = await createServerClient()

  const normalized = identifier.trim()
  // Le token est un hex 64 chars, le code est 6 chars
  const session =
    normalized.length > 10
      ? await getSessionByToken(supabase, normalized)
      : await getSessionByCode(supabase, normalized)

  if (!session) {
    throw new Error('Session introuvable. Vérifie le lien ou le code.')
  }

  if (session.status === 'voting') {
    throw new Error('Le vote a déjà démarré.')
  }

  if (session.status === 'closed') {
    throw new Error('Cette session est terminée.')
  }

  const participant = await upsertParticipant(supabase, session.id, userId)
  return { session, participant }
}
