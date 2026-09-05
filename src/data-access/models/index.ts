/**
 * Types de domaine dérivés du schéma généré par Supabase.
 * Importer d'ici plutôt que depuis `database.ts`.
 */
import type { Database } from './database'

export type { Json } from './database'

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

export type SessionPreview = Functions['session_preview']['Returns'][number]
export type SessionResultRow = Functions['session_results']['Returns'][number]
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
