import { inviteGroupToSession } from '@/data-access/groups'
import { getRestaurantIdsForLists } from '@/data-access/lists'
import { getRecentWinners } from '@/data-access/recent-winners'
import { createSession } from '@/data-access/sessions'
import { AppError } from '@/domain/errors'
import {
  RECENT_WINNER_WINDOW_DAYS,
  recentWinnerDates,
  withoutRecentWinners,
} from '@/domain/recent-winners'
import { resolveClosesAt } from '@/domain/session-deadline'

import type { Session } from '@/data-access/models'
import type { Database } from '@/data-access/models/database'
import type { CreateSessionInput } from '@/domain/schemas/session'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Résout les restaurants depuis les listes choisies + la sélection directe,
 * dédoublonne en conservant l'ordre, écarte les gagnants récents si on l'a
 * demandé, résout l'échéance de clôture, puis délègue à la RPC
 * transactionnelle.
 *
 * L'anti-fatigue est appliqué ici et pas dans le navigateur : une liste
 * apporte ses restaurants sans les montrer un par un, et c'est le serveur qui
 * sait lesquels ont gagné.
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
  const selected = [...new Set([...fromLists, ...input.restaurantIds])]

  if (selected.length === 0) {
    throw new AppError('Sélectionne au moins un restaurant.')
  }

  const restaurantIds = input.excludeRecentWinners
    ? withoutRecentWinners(selected, recentWinnerDates(await getRecentWinners(supabase)))
    : selected

  if (restaurantIds.length === 0) {
    throw new AppError(
      `Tous ces restos ont gagné dans les ${RECENT_WINNER_WINDOW_DAYS} derniers jours. Décoche l’anti-fatigue ou ajoute un autre resto.`
    )
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
