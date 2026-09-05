/**
 * Types de domaine dérivés du schéma généré par Supabase.
 * Importer d'ici plutôt que depuis `database.ts`.
 */
import type { Database } from './database'

type Tables = Database['public']['Tables']
type Functions = Database['public']['Functions']

export type Profile = Tables['profiles']['Row']
export type List = Tables['lists']['Row']
export type Restaurant = Tables['restaurants']['Row']
export type Session = Tables['sessions']['Row']
export type SessionParticipant = Tables['session_participants']['Row']
export type SessionRestaurant = Tables['session_restaurants']['Row']
export type Vote = Tables['votes']['Row']
export type ListRestaurant = Tables['list_restaurants']['Row']

export type SessionStatus = Database['public']['Enums']['session_status']

// Les deux types suivants réparent ce que le générateur ne peut pas déduire :
// une colonne de `returns table (...)` ne porte aucune information `NOT NULL`,
// donc tout en ressort non nul. La correction vit ici et non dans
// `database.ts`, qui doit rester identique à la sortie de `bun run db:types`
// — c'est ce que vérifie le workflow « Base de données » en commande `check`.

/**
 * `host_pseudo` est nul quand le host a supprimé son compte : la session
 * survit, orpheline, et `session_preview` la joint à `profiles` en externe.
 */
export type SessionPreview = Omit<
  Functions['session_preview']['Returns'][number],
  'host_pseudo'
> & { host_pseudo: string | null }

/**
 * `cuisine_type`, `description` et `image_url` viennent de `restaurants`, où
 * elles sont nullables ; `session_results` les remonte telles quelles.
 */
export type SessionResultRow = Omit<
  Functions['session_results']['Returns'][number],
  'cuisine_type' | 'description' | 'image_url'
> &
  Pick<Restaurant, 'cuisine_type' | 'description' | 'image_url'>

export type SharedListPreview = Functions['list_by_share_token']['Returns'][number]

/** Participant avec le profil joint (pseudo) */
export type ParticipantWithProfile = SessionParticipant & {
  profiles: Pick<Profile, 'id' | 'pseudo'> | null
}

/** Restaurant d'une session, dans l'ordre de présentation */
export type SessionRestaurantWithRestaurant = SessionRestaurant & {
  restaurants: Restaurant | null
}

/** Liste avec le nombre de restaurants */
export type ListSummary = List & { restaurant_count: number }

/** Liste avec ses restaurants */
export type ListWithRestaurants = List & {
  restaurants: Restaurant[]
}

/** Session avec le nombre de participants (page d'accueil) */
export type SessionSummary = Session & { participant_count: number }
