/**
 * Domain model types derived from the Supabase-generated Database schema.
 * Import domain types from here instead of directly from `database.ts`.
 */
import type { Database } from './database'

type Tables = Database['public']['Tables']

export type Profile = Tables['profiles']['Row']
export type List = Tables['lists']['Row']
export type Restaurant = Tables['restaurants']['Row']
export type Session = Tables['sessions']['Row']
export type SessionParticipant = Tables['session_participants']['Row']
export type SessionRestaurant = Tables['session_restaurants']['Row']
export type Vote = Tables['votes']['Row']
export type ListRestaurant = Tables['list_restaurants']['Row']

export type SessionStatus = Database['public']['Enums']['session_status']
