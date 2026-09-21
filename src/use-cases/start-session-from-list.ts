import { getSharedListPreview, getSharedListRestaurants } from '@/data-access/lists'
import { createSession } from '@/data-access/sessions'
import { AppError } from '@/domain/errors'
import { SESSION_NAME_MAX } from '@/domain/schemas/session'

import type { Session } from '@/data-access/models'
import type { Database } from '@/data-access/models/database'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * « Lancer une session depuis cette liste » : la porte d'entrée de qui reçoit
 * un lien de liste. Pas de formulaire, pas de sélection — la liste dit déjà
 * quoi départager, et son nom fait celui de la session.
 *
 * Les deux lectures passent par les RPC de partage plutôt que par les tables :
 * celui qui clique n'est pas le propriétaire de la liste, la RLS ne lui en
 * montrerait rien. Le contenu est relu ici, au moment du clic, et jamais posté
 * par le navigateur : une page mise en cache ne peut pas décider de ce qui
 * entre dans la session.
 */
export async function startSessionFromListUseCase(
  supabase: SupabaseClient<Database>,
  identifier: string
): Promise<Session> {
  const [preview, restaurants] = await Promise.all([
    getSharedListPreview(supabase, identifier),
    getSharedListRestaurants(supabase, identifier),
  ])

  if (!preview) throw new AppError('Cette liste n’existe pas ou le lien est invalide.')
  if (restaurants.length === 0) {
    throw new AppError('Cette liste est encore vide : il n’y a rien à départager.')
  }

  return createSession(supabase, {
    // Un nom de liste tient en 60 caractères et une session en accepte 100 :
    // la coupe ne sert qu'à ne jamais dépendre de cet écart.
    name: preview.name.slice(0, SESSION_NAME_MAX),
    restaurantIds: restaurants.map((restaurant) => restaurant.id),
  })
}
