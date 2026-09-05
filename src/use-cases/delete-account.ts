import { deleteMyAccount } from '@/data-access/account'

import type { Database } from '@/data-access/models/database'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Effacement du compte (art. 17 RGPD). La RPC fait tout le travail en base ;
 * il reste le cookie de session, qui pointe désormais sur un compte inexistant
 * — le vider fait partie de la suppression.
 *
 * L'échec de la déconnexion n'est pas remonté : à ce stade le compte est déjà
 * supprimé, le signaler comme un échec de suppression serait faux. Le jeton
 * restant ne vaut plus rien, la prochaine lecture le constatera.
 */
export async function deleteAccountUseCase(supabase: SupabaseClient<Database>): Promise<void> {
  await deleteMyAccount(supabase)
  await supabase.auth.signOut().catch(() => undefined)
}
