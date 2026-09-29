'use server'

import { revalidatePath } from 'next/cache'

import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { saveMyFoodConstraints } from '@/data-access/food-constraints'
import { createServerClient } from '@/data-access/supabase/server'
import { toUserMessage } from '@/domain/errors'
import { hasFoodConstraints } from '@/domain/food-constraints'
import { FoodConstraintsSchema } from '@/domain/schemas/food-constraints'

import type { FormState } from './types'

/**
 * « Ce que je ne peux pas manger » (issue #60). Les cases cochées et le
 * budget choisi remplacent ce qui était déclaré : tout décocher revient à
 * tout retirer, sans autre bouton. Seuls `tags` et `maxPriceLevel` sont lus
 * du formulaire, et la base revalide les deux.
 */
export async function saveFoodConstraintsAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = FoodConstraintsSchema.safeParse({
    tags: formData.getAll('tags'),
    maxPriceLevel: formData.get('maxPriceLevel'),
  })
  if (!parsed.success) return { error: 'Ces contraintes ne sont pas valides.' }

  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (!user) return { error: 'Tu dois d’abord choisir un pseudo.' }

  try {
    await saveMyFoodConstraints(supabase, parsed.data)
  } catch (error) {
    return { error: toUserMessage(error, 'Impossible d’enregistrer tes contraintes. Réessaie.') }
  }

  revalidatePath(router.account())
  return {
    success: hasFoodConstraints(parsed.data)
      ? 'C’est noté : tes sessions le signaleront.'
      : 'Plus rien de déclaré.',
  }
}
