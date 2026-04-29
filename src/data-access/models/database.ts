export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      list_restaurants: {
        Row: {
          added_at: string
          list_id: string
          restaurant_id: string
        }
        Insert: {
          added_at?: string
          list_id: string
          restaurant_id: string
        }
        Update: {
          added_at?: string
          list_id?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'list_restaurants_list_id_fkey'
            columns: ['list_id']
            isOneToOne: false
            referencedRelation: 'lists'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'list_restaurants_restaurant_id_fkey'
            columns: ['restaurant_id']
            isOneToOne: false
            referencedRelation: 'restaurants'
            referencedColumns: ['id']
          },
        ]
      }
      lists: {
        Row: {
          created_at: string
          id: string
          is_collaborative: boolean
          name: string
          owner_id: string
          share_token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_collaborative?: boolean
          name: string
          owner_id: string
          share_token?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_collaborative?: boolean
          name?: string
          owner_id?: string
          share_token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'lists_owner_id_fkey'
            columns: ['owner_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          pseudo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          pseudo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          pseudo?: string
          updated_at?: string
        }
        Relationships: []
      }
      restaurants: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          cuisine_type: string | null
          description: string | null
          id: string
          image_url: string | null
          name: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          cuisine_type?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          cuisine_type?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
        }
        Relationships: []
      }
      session_participants: {
        Row: {
          has_finished_voting: boolean
          id: string
          joined_at: string
          profile_id: string
          session_id: string
          super_dislike_used: boolean
          superlike_used: boolean
        }
        Insert: {
          has_finished_voting?: boolean
          id?: string
          joined_at?: string
          profile_id: string
          session_id: string
          super_dislike_used?: boolean
          superlike_used?: boolean
        }
        Update: {
          has_finished_voting?: boolean
          id?: string
          joined_at?: string
          profile_id?: string
          session_id?: string
          super_dislike_used?: boolean
          superlike_used?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'session_participants_profile_id_fkey'
            columns: ['profile_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'session_participants_session_id_fkey'
            columns: ['session_id']
            isOneToOne: false
            referencedRelation: 'sessions'
            referencedColumns: ['id']
          },
        ]
      }
      session_restaurants: {
        Row: {
          id: string
          position: number
          restaurant_id: string
          session_id: string
        }
        Insert: {
          id?: string
          position: number
          restaurant_id: string
          session_id: string
        }
        Update: {
          id?: string
          position?: number
          restaurant_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'session_restaurants_restaurant_id_fkey'
            columns: ['restaurant_id']
            isOneToOne: false
            referencedRelation: 'restaurants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'session_restaurants_session_id_fkey'
            columns: ['session_id']
            isOneToOne: false
            referencedRelation: 'sessions'
            referencedColumns: ['id']
          },
        ]
      }
      sessions: {
        Row: {
          closed_at: string | null
          created_at: string
          host_id: string
          id: string
          invite_code: string
          invite_token: string
          launched_at: string | null
          name: string
          status: Database['public']['Enums']['session_status']
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          host_id: string
          id?: string
          invite_code?: string
          invite_token?: string
          launched_at?: string | null
          name: string
          status?: Database['public']['Enums']['session_status']
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          host_id?: string
          id?: string
          invite_code?: string
          invite_token?: string
          launched_at?: string | null
          name?: string
          status?: Database['public']['Enums']['session_status']
        }
        Relationships: [
          {
            foreignKeyName: 'sessions_host_id_fkey'
            columns: ['host_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      votes: {
        Row: {
          created_at: string
          id: string
          participant_id: string
          session_id: string
          session_restaurant_id: string
          value: number
        }
        Insert: {
          created_at?: string
          id?: string
          participant_id: string
          session_id: string
          session_restaurant_id: string
          value: number
        }
        Update: {
          created_at?: string
          id?: string
          participant_id?: string
          session_id?: string
          session_restaurant_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: 'votes_participant_id_fkey'
            columns: ['participant_id']
            isOneToOne: false
            referencedRelation: 'session_participants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'votes_session_id_fkey'
            columns: ['session_id']
            isOneToOne: false
            referencedRelation: 'sessions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'votes_session_restaurant_id_fkey'
            columns: ['session_restaurant_id']
            isOneToOne: false
            referencedRelation: 'session_restaurants'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      session_status: 'waiting' | 'voting' | 'closed'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      session_status: ['waiting', 'voting', 'closed'],
    },
  },
} as const
