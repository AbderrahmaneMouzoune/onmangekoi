import { updatePseudo } from '@/data-access/profile'

import type { Database } from '@/data-access/models/database'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Onboarding « zéro friction » : l'utilisateur anonyme Supabase n'est créé
 * qu'ici, au moment où la personne choisit son pseudo — jamais sur une simple
 * visite. Si un utilisateur existe déjà, on met simplement le pseudo à jour.
 */
export async function setupProfileUseCase(
  supabase: SupabaseClient<Database>,
  pseudo: string
): Promise<{ userId: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    await Promise.all([
      updatePseudo(supabase, user.id, pseudo),
      supabase.auth.updateUser({ data: { pseudo } }),
    ])
    return { userId: user.id }
  }

  const { data, error } = await supabase.auth.signInAnonymously({
    options: { data: { pseudo } },
  })
  if (error) throw error
  if (!data.user) throw new Error('anonymous_sign_in_failed')

  // Le trigger `handle_new_user` a déjà posé le pseudo ; on sécurise le cas
  // où les metadata n'auraient pas été propagées.
  await updatePseudo(supabase, data.user.id, pseudo)

  return { userId: data.user.id }
}
