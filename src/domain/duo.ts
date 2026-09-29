/**
 * Mode duo (issue #61) : décider à deux, sans salle d'attente ni code.
 *
 * La base porte tout ce qui compte — deux places (`omk:duo_full`), la
 * clôture au premier accord et la décision posée dans la foulée
 * (`handle_duo_agreement`). Ces fonctions pures servent l'interface : dire où
 * en est le duo, et reconnaître un accord dans le classement.
 */

import type { ParticipantWithProfile } from '@/data-access/models'
import type { VoteValue } from '@/domain/vote'

/** Deux places, pas une de plus — même borne qu'en base. */
export const DUO_SEATS = 2

/**
 * Deux restos au moins, comme la base l'exige à la création : personne ne
 * pourra en ajouter une fois le duo parti, et un seul ne se départage pas.
 */
export const DUO_MIN_RESTAURANTS = 2

/**
 * Plus petit vote qui compte pour un accord : « ça me va » (1). Un coup de
 * cœur (2) en est un aussi ; « bof » (0) et veto (−2) jamais.
 */
export const AGREEMENT_MIN_VOTE = 1

/** Ce vote peut-il sceller un accord, si l'autre a dit pareil ? */
export function isAgreementVote(value: VoteValue): boolean {
  return value >= AGREEMENT_MIN_VOTE
}

/** L'autre personne du duo, ou `null` tant qu'elle n'a pas ouvert le lien. */
export function partnerOf(
  participants: ParticipantWithProfile[],
  meId: string
): ParticipantWithProfile | null {
  return participants.find((participant) => participant.profile_id !== meId) ?? null
}

/** Le duo attend-il encore sa seconde personne ? */
export function isWaitingForPartner(participants: ParticipantWithProfile[]): boolean {
  return participants.length < DUO_SEATS
}

/**
 * Ce que l'ardoise dit à qui a fini son deck (`session.finished.duo.<kind>`).
 * Sans accord, le vote ne s'arrête pas là : il attend l'autre — son arrivée
 * d'abord, puis la fin de son deck —, et le premier « ça me va » commun peut
 * encore tout régler.
 */
export type DuoFinishedState =
  | { kind: 'partnerAbsent' }
  | { kind: 'bothDone' }
  | { kind: 'partnerVoting'; pseudo: string | null }

export function duoFinishedState(partner: ParticipantWithProfile | null): DuoFinishedState {
  if (!partner) return { kind: 'partnerAbsent' }
  if (partner.has_finished_voting) return { kind: 'bothDone' }
  return { kind: 'partnerVoting', pseudo: partner.profiles?.pseudo ?? null }
}

/** Ce que le classement doit porter pour reconnaître un accord. */
export interface AgreementRow {
  decided: boolean
  likes: number
  superlikes: number
}

/**
 * L'accord d'un duo, lu dans son classement : le restaurant retenu, à
 * condition que les deux aient dit « ça me va » ou mieux. C'est exactement ce
 * qui a fermé la session — la base pose la décision au même instant —, sans
 * colonne de plus pour le dire.
 *
 * Un duo clos sans accord n'a aucun restaurant à deux « oui » : le premier
 * aurait fermé le vote. Si le host y confirme ensuite un restaurant, c'est
 * une décision ordinaire (#55), pas un accord : `null`.
 */
export function duoAgreement<T extends AgreementRow>(rows: T[]): T | null {
  const decided = rows.find((row) => row.decided)
  if (!decided) return null
  return decided.likes + decided.superlikes >= DUO_SEATS ? decided : null
}
