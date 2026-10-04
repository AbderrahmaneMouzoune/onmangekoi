import { cacheLife } from 'next/cache'

import { createPublicClient } from '@/data-access/supabase/public'

import type { SessionPreview } from './models'

/**
 * L'aperçu d'une invitation tel que le voit qui n'a pas de pseudo : le robot
 * d'aperçu de Slack ou de WhatsApp qui déplie un lien `/join/<code>`. Il sert
 * l'image Open Graph de l'invitation.
 *
 * Pourquoi un client anonyme, et un cache : l'image a un texte alternatif
 * traduit, donc une variante par langue (`generateImageMetadata`), ce qui en
 * fait une route prérendue à la demande — elle ne peut plus lire de cookie.
 * C'est aussi exactement ce que voit le robot, qui n'en envoie aucun : la RPC
 * répond pareil au rôle `anon` (session encore ouverte aux arrivées), et le
 * lien collé dans une conversation de groupe est déplié par tout le monde à
 * la fois.
 *
 * Quelques minutes de cache : le nombre de restos peut bouger en salle
 * d'attente, une vignette déjà envoyée, elle, ne bougera plus de toute façon.
 *
 * Son propre module pour la même raison que `public-results.ts` : le client
 * anonyme est `server-only`.
 */
export async function getPublicSessionPreview(identifier: string): Promise<SessionPreview | null> {
  'use cache'
  cacheLife('minutes')

  const { data, error } = await createPublicClient().rpc('session_preview', {
    p_identifier: identifier,
  })
  if (error) throw error
  return data[0] ?? null
}
