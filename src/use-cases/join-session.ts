import { joinSession } from '@/data-access/sessions'
import { AppError } from '@/domain/errors'
import { parseInviteIdentifier } from '@/domain/share'

import type { Session } from '@/data-access/models'
import type { Database } from '@/data-access/models/database'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Rejoint une session à partir d'un code, d'un token ou d'un lien collé.
 * L'opération est idempotente côté base.
 */
export async function joinSessionUseCase(
  supabase: SupabaseClient<Database>,
  rawIdentifier: string
): Promise<Session> {
  const identifier = parseInviteIdentifier(rawIdentifier)
  if (identifier.kind === 'invalid') {
    throw new AppError('Ce code ou ce lien n’a pas le bon format.')
  }
  return joinSession(supabase, identifier.value)
}
