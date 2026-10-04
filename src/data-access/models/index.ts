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
/** Comment une égalité de tête a été tranchée : second tour ou tirage au sort. */
export type TiebreakMethod = Database['public']['Enums']['tiebreak_method']

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
 * Carte de visite d'une liste publique — ce que voit qui arrive par le lien
 * sans avoir de pseudo. `top_restaurant` et son compteur sont nuls tant
 * qu'aucune session close n'a désigné de gagnant parmi les restaurants de la
 * liste ; le générateur, lui, ne voit que des colonnes de `returns table`.
 */
export type PublicListPreview = Omit<
  Functions['public_list']['Returns'][number],
  'top_restaurant' | 'top_restaurant_wins'
> & { top_restaurant: string | null; top_restaurant_wins: number | null }

/** Une entrée de sitemap : le code d'une liste publique et sa fraîcheur. */
export type PublicListEntry = Functions['public_lists']['Returns'][number]

/**
 * Restaurant sorti gagnant d'une session close récente, et la date de son
 * dernier sacre. Aucune des deux colonnes n'est nulle en base — c'est le
 * générateur qui ne peut pas le savoir d'un `returns table (...)`.
 */
export type RecentWinner = Functions['recent_winners']['Returns'][number]

/**
 * Une ligne de la sélection proposée à la création (`suggest_restaurants`,
 * issue #59). La base n'écrit que ces valeurs-là dans `reason` et `source` ;
 * le générateur, lui, n'y voit que du texte.
 *  - `recent` / `history` : vu récemment dans une session, sans avoir gagné ;
 *  - `never_proposed` / `mine` : jamais proposé, pris dans les listes ou les
 *    ajouts de la personne ;
 *  - `never_proposed` / `catalog` : jamais proposé, le dernier arrivé au carnet.
 */
export type SuggestedRestaurantRow = Omit<
  Functions['suggest_restaurants']['Returns'][number],
  'reason' | 'source'
> & {
  reason: 'recent' | 'never_proposed'
  source: 'history' | 'mine' | 'catalog'
}

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

/**
 * Place d'une ligne dans le départage de l'égalité de tête :
 *  - `tied` : ex æquo, rien n'est encore tranché ;
 *  - `runoff` : un second tour est en cours entre les ex æquo ;
 *  - `winner` / `loser` : le tirage au sort a désigné, ou écarté, cette ligne.
 * `null` sur tout ce qui n'est pas concerné — l'immense majorité des cas.
 */
export type TiebreakState = 'tied' | 'runoff' | 'winner' | 'loser'

export type SessionResultRow = Omit<
  Functions['session_results']['Returns'][number],
  ResultRestaurantColumns | 'tiebreak'
> &
  Pick<Restaurant, ResultRestaurantColumns> & { tiebreak: TiebreakState | null }

/**
 * Une ligne du podium public. Comme `session_results`, la RPC recopie des
 * colonnes de `restaurants` que `returns table` déclare toutes non nulles :
 * on leur rend leur nullabilité.
 */
type PublicResultRestaurantColumns = 'city' | 'cuisine_type' | 'photo_url'

export type PublicResultRow = Omit<
  Functions['public_results']['Returns'][number],
  PublicResultRestaurantColumns | 'closed_at' | 'participant_count' | 'session_name'
> &
  Pick<Restaurant, PublicResultRestaurantColumns>

/**
 * Le classement tel qu'il sort du lien public : le nom de la session, le
 * nombre de participants, le podium, et le restaurant où le groupe va quand
 * le host l'a confirmé (`decision`, issue #55) — qui peut être hors podium.
 * Aucun pseudo, aucun détail de vote — la RPC ne les renvoie pas, et c'est le
 * seul endroit où ça se joue.
 */
export interface PublicResults {
  sessionName: string
  closedAt: string | null
  participantCount: number
  /** Les rangs 1 à 3 du vote. */
  podium: PublicResultRow[]
  /** Le restaurant retenu par le host, ou `null` tant qu'il n'a rien confirmé. */
  decision: PublicResultRow | null
}

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

/**
 * Ligne d'historique (`my_sessions`). Quatre colonnes n'existent qu'une fois
 * la session close : sa date de clôture et le restaurant qu'elle a désigné —
 * celui que le host a confirmé (`winner_decided`, issue #55), à défaut celui
 * que le classement place en tête. Comme pour `session_results`, le
 * générateur ne peut pas le déduire d'un `returns table (...)`.
 */
type NullableHistoryColumns = 'closed_at' | 'winner_name' | 'winner_score' | 'winner_decided'

export type SessionHistoryEntry = Omit<
  Functions['my_sessions']['Returns'][number],
  NullableHistoryColumns
> & {
  closed_at: string | null
  winner_name: string | null
  winner_score: number | null
  winner_decided: boolean | null
}

/**
 * Statistiques personnelles (`my_stats`). Les deux libellés sont nuls tant
 * qu'aucun vote ni aucune session close ne permet de les désigner.
 */
export type MyStats = Omit<
  Functions['my_stats']['Returns'][number],
  'favorite_cuisine' | 'top_restaurant_name'
> & {
  favorite_cuisine: string | null
  top_restaurant_name: string | null
}

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
