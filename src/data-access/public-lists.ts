import { cacheLife, cacheTag } from 'next/cache'

import { createPublicClient } from '@/data-access/supabase/public'

import type { PublicListEntry, PublicListPreview, Restaurant } from './models'

/**
 * Une liste telle qu'on la sert derrière `/l/<code>` à qui n'a pas de pseudo
 * et n'a jamais mis les pieds dans l'app.
 *
 * Son propre module, et pas `lists.ts`, pour deux raisons : ces lectures ne
 * passent jamais par le client lié aux cookies — donc jamais par la RLS —, et
 * le client anonyme est `server-only`, ce qui contaminerait tout ce qui
 * importe la couche listes.
 */

/**
 * Profil de durée des lectures publiques. Les écritures du propriétaire
 * purgent l'entrée sur-le-champ (`updateTag`) ; ce profil ne borne que le
 * reste. `hours` revalide à l'heure — c'est ce qui tient l'image Open Graph, la plus
 * coûteuse à produire, sans figer la page quand le propriétaire referme le
 * partage.
 */
export const PUBLIC_LISTS_CACHE_PROFILE = 'hours'

/** Entrée de cache d'une liste publique : sa carte de visite et son contenu. */
export function publicListCacheTag(code: string): string {
  return `public-list:${code}`
}

/** Entrée de cache de l'énumération des listes publiques (le sitemap). */
export const PUBLIC_LISTS_CACHE_TAG = 'public-lists'

/**
 * La carte de visite derrière un code, ou `null` si le lien ne mène nulle
 * part — code inconnu, ou partage que le propriétaire n'a pas ouvert. La RPC
 * tranche : ici, on ne fait que lire.
 *
 * Mise en cache et partagée par tout le monde : la page, ses métadonnées et
 * son image Open Graph la lisent, et un lien collé dans une conversation de
 * groupe est ouvert par des dizaines de personnes à la fois.
 */
export async function getPublicList(code: string): Promise<PublicListPreview | null> {
  'use cache'
  cacheLife(PUBLIC_LISTS_CACHE_PROFILE)
  cacheTag(publicListCacheTag(code))

  const { data, error } = await createPublicClient().rpc('public_list', { p_code: code })
  if (error) throw error
  return data[0] ?? null
}

/** Le contenu d'une liste publique. Vide si la liste ne l'est pas (ou plus). */
export async function getPublicListRestaurants(code: string): Promise<Restaurant[]> {
  'use cache'
  cacheLife(PUBLIC_LISTS_CACHE_PROFILE)
  cacheTag(publicListCacheTag(code))

  const { data, error } = await createPublicClient().rpc('public_list_restaurants', {
    p_code: code,
  })
  if (error) throw error
  return data
}

/** Les listes publiques, pour le sitemap : un code et une date, rien d'autre. */
export async function getPublicListEntries(): Promise<PublicListEntry[]> {
  'use cache'
  cacheLife(PUBLIC_LISTS_CACHE_PROFILE)
  cacheTag(PUBLIC_LISTS_CACHE_TAG)

  const { data, error } = await createPublicClient().rpc('public_lists')
  if (error) throw error
  return data
}
