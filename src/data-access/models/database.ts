/**
 * Types générés manuellement depuis la migration init_schema.
 * À régénérer avec `supabase gen types typescript --local > src/data-access/models/database.ts`
 * une fois Docker lancé et `supabase start` exécuté.
 */

export type SessionStatus = 'waiting' | 'voting' | 'closed'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          pseudo: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          pseudo: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          pseudo?: string
          created_at?: string
          updated_at?: string
        }
      }
      restaurants: {
        Row: {
          id: string
          name: string
          cuisine_type: string | null
          address: string | null
          city: string | null
          description: string | null
          image_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          cuisine_type?: string | null
          address?: string | null
          city?: string | null
          description?: string | null
          image_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          cuisine_type?: string | null
          address?: string | null
          city?: string | null
          description?: string | null
          image_url?: string | null
          created_at?: string
        }
      }
      lists: {
        Row: {
          id: string
          name: string
          owner_id: string
          share_token: string
          is_collaborative: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          owner_id: string
          share_token?: string
          is_collaborative?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          owner_id?: string
          share_token?: string
          is_collaborative?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      list_restaurants: {
        Row: {
          list_id: string
          restaurant_id: string
          added_at: string
        }
        Insert: {
          list_id: string
          restaurant_id: string
          added_at?: string
        }
        Update: {
          list_id?: string
          restaurant_id?: string
          added_at?: string
        }
      }
      sessions: {
        Row: {
          id: string
          name: string
          host_id: string
          invite_token: string
          status: SessionStatus
          created_at: string
          launched_at: string | null
          closed_at: string | null
        }
        Insert: {
          id?: string
          name: string
          host_id: string
          invite_token?: string
          status?: SessionStatus
          created_at?: string
          launched_at?: string | null
          closed_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          host_id?: string
          invite_token?: string
          status?: SessionStatus
          created_at?: string
          launched_at?: string | null
          closed_at?: string | null
        }
      }
      session_restaurants: {
        Row: {
          id: string
          session_id: string
          restaurant_id: string
          position: number
        }
        Insert: {
          id?: string
          session_id: string
          restaurant_id: string
          position: number
        }
        Update: {
          id?: string
          session_id?: string
          restaurant_id?: string
          position?: number
        }
      }
      session_participants: {
        Row: {
          id: string
          session_id: string
          profile_id: string
          joined_at: string
          has_finished_voting: boolean
          superlike_used: boolean
          super_dislike_used: boolean
        }
        Insert: {
          id?: string
          session_id: string
          profile_id: string
          joined_at?: string
          has_finished_voting?: boolean
          superlike_used?: boolean
          super_dislike_used?: boolean
        }
        Update: {
          id?: string
          session_id?: string
          profile_id?: string
          joined_at?: string
          has_finished_voting?: boolean
          superlike_used?: boolean
          super_dislike_used?: boolean
        }
      }
      votes: {
        Row: {
          id: string
          session_id: string
          participant_id: string
          session_restaurant_id: string
          value: -2 | 0 | 1 | 2
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          participant_id: string
          session_restaurant_id: string
          value: -2 | 0 | 1 | 2
          created_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          participant_id?: string
          session_restaurant_id?: string
          value?: -2 | 0 | 1 | 2
          created_at?: string
        }
      }
    }
    Enums: {
      session_status: SessionStatus
    }
  }
}

// ─── Row types (raccourcis) ───────────────────────────────────
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Restaurant = Database['public']['Tables']['restaurants']['Row']
export type List = Database['public']['Tables']['lists']['Row']
export type ListRestaurant = Database['public']['Tables']['list_restaurants']['Row']
export type Session = Database['public']['Tables']['sessions']['Row']
export type SessionRestaurant = Database['public']['Tables']['session_restaurants']['Row']
export type SessionParticipant = Database['public']['Tables']['session_participants']['Row']
export type Vote = Database['public']['Tables']['votes']['Row']

// ─── Vote value ───────────────────────────────────────────────
export type VoteValue = -2 | 0 | 1 | 2
