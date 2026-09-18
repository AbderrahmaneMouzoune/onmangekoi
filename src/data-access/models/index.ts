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
export type Group = Tables['groups']['Row']
export type GroupMember = Tables['group_members']['Row']
export type SessionInvitation = Tables['session_invitations']['Row']

export type SessionStatus = Database['public']['Enums']['session_status']

// Les types suivants réparent ce que le générateur ne peut pas déduire :
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

export type SharedListPreview = Functions['list_by_share_token']['Returns'][number]

/**
 * Invitation en attente, vue par l'invité. Le pseudo du host est nul quand
 * il a supprimé son compte ; le nom du groupe l'est quand le groupe a été
 * supprimé depuis l'invitation — la session, elle, reste rejoignable.
 */
export type PendingInvitation = Omit<
  Functions['my_session_invitations']['Returns'][number],
  'host_pseudo' | 'group_name'
> & { host_pseudo: string | null; group_name: string | null }

/**
 * Colonnes que `session_results` recopie de `restaurants`, toutes nullables en
 * base. La fiche restaurant s'appuie dessus pour masquer proprement une donnée
 * absente : une photo, une adresse ou des horaires qu'on n'a pas.
 */
type ResultRestaurantColumns =
  | 'address'
  | 'city'
  | 'cuisine_type'
  | 'description'
  | 'location'
  | 'opening_hours'
  | 'photo_url'
  | 'website'

export type SessionResultRow = Omit<
  Functions['session_results']['Returns'][number],
  ResultRestaurantColumns
> &
  Pick<Restaurant, ResultRestaurantColumns>

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

/** Membre d'un groupe avec le profil joint (pseudo) */
export type GroupMemberWithProfile = GroupMember & {
  profiles: Pick<Profile, 'id' | 'pseudo'> | null
}

/** Groupe avec ses membres, dans l'ordre d'ajout */
export type GroupWithMembers = Group & { members: GroupMemberWithProfile[] }

/** Invité en attente d'une session, vu par le host */
export type InvitationWithProfile = SessionInvitation & {
  profiles: Pick<Profile, 'id' | 'pseudo'> | null
}
