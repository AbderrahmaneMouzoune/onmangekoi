import { cache } from 'react'

import { RESTAURANT_TAGS } from '@/domain/schemas/restaurant'

import type { Database } from './models/database'
import type { FoodConstraints } from '@/domain/food-constraints'
import type { FoodConstraintsInput } from '@/domain/schemas/food-constraints'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Contraintes alimentaires (issue #60).
 *
 * Les siennes se lisent sous RLS, directement dans `profile_constraints` et
 * `profile_budgets` : les policies ne laissent voir que ses propres lignes.
 * Celles des autres ne se lisent jamais — seul le compte par resto d'une
 * session sort de la base, par `session_constraint_conflicts`.
 */

/**
 * Ses propres contraintes. Mémoïsée par requête : la page compte et la page
 * de création la lisent une fois chacune.
 */
export const getMyFoodConstraints = cache(
  async (supabase: SupabaseClient<Database>, userId: string): Promise<FoodConstraints> => {
    // Le filtre sur `profile_id` double la RLS : il dit ce qu'on veut lire,
    // la policy garantit qu'on ne lirait rien d'autre.
    const [tags, budget] = await Promise.all([
      supabase.from('profile_constraints').select('tag').eq('profile_id', userId),
      supabase
        .from('profile_budgets')
        .select('max_price_level')
        .eq('profile_id', userId)
        .maybeSingle(),
    ])
    if (tags.error) throw tags.error
    if (budget.error) throw budget.error

    const declared = new Set(tags.data.map((row) => row.tag))
    return {
      tags: RESTAURANT_TAGS.filter((tag) => declared.has(tag)),
      maxPriceLevel: budget.data?.max_price_level ?? null,
    }
  }
)

/** Remplace ses contraintes par celles données ; tout vide revient à tout retirer. */
export async function saveMyFoodConstraints(
  supabase: SupabaseClient<Database>,
  constraints: FoodConstraintsInput
): Promise<void> {
  const { error } = await supabase.rpc('save_my_constraints', {
    p_tags: constraints.tags,
    // Le générateur ne sait pas qu'un paramètre `default null` accepte `null`.
    p_max_price_level: constraints.maxPriceLevel ?? undefined,
  })
  if (error) throw error
}

/**
 * Pour chaque resto de la session qu'au moins un participant ne peut pas
 * manger : combien sont concernés. Jamais qui. Réservée aux participants.
 */
export async function getSessionConstraintConflicts(
  supabase: SupabaseClient<Database>,
  sessionId: string
): Promise<{ restaurant_id: string; blocked_count: number }[]> {
  const { data, error } = await supabase.rpc('session_constraint_conflicts', {
    p_session_id: sessionId,
  })
  if (error) throw error
  return data
}
