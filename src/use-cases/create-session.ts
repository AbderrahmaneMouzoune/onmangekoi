import { inviteGroupToSession } from '@/data-access/groups'
import { getRestaurantIdsForLists } from '@/data-access/lists'
import { createSession } from '@/data-access/sessions'
import { AppError } from '@/domain/errors'
import { resolveClosesAt } from '@/domain/session-deadline'

import type { Session } from '@/data-access/models'
import type { Database } from '@/data-access/models/database'
import type { CreateSessionInput } from '@/domain/schemas/session'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Résout les restaurants depuis les listes choisies + la sélection directe,
 * dédoublonne en conservant l'ordre, résout l'échéance de clôture, puis
 * délègue à la RPC transactionnelle.
 *
 * `now` est injectable pour les tests ; en production c'est l'horloge du
 * serveur qui date une échéance choisie en durée — jamais celle du navigateur,
 * qui peut dériver.
 */
export async function createSessionUseCase(
  supabase: SupabaseClient<Database>,
  input: CreateSessionInput,
  now: Date = new Date()
): Promise<Session> {
  const fromLists = await getRestaurantIdsForLists(supabase, input.listIds)
  const restaurantIds = [...new Set([...fromLists, ...input.restaurantIds])]

  if (restaurantIds.length === 0) {
    throw new AppError('Sélectionne au moins un restaurant.')
  }

  const session = await createSession(supabase, {
    name: input.name,
    restaurantIds,
    closesAt: resolveClosesAt(input, now),
  })

  // Les invitations viennent après coup : la session existe déjà, on ne la
  // renie pas parce qu'un groupe n'a pas pu être prévenu. La salle d'attente
  // affiche qui est réellement invité, et le host peut réinviter de là.
  for (const groupId of input.groupIds) {
    try {
      await inviteGroupToSession(supabase, groupId, session.id)
    } catch {
      // Groupe quitté entre-temps, réseau : rien qui doive annuler la session.
    }
  }

  return session
}
