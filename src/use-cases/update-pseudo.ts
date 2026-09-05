import { updatePseudo } from '@/data-access/profile'

import type { Database } from '@/data-access/models/database'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Le pseudo vit à deux endroits : la table `profiles`, lue par l'application,
 * et les metadata Supabase, disponibles avant que le profil ne soit chargé.
 * On garde les deux en phase.
 */
export async function updatePseudoUseCase(
  supabase: SupabaseClient<Database>,
  userId: string,
  pseudo: string
): Promise<void> {
  await Promise.all([
    updatePseudo(supabase, userId, pseudo),
    supabase.auth.updateUser({ data: { pseudo } }),
  ])
}
