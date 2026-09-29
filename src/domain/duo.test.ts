import { describe, expect, it } from 'vitest'

import {
  duoAgreement,
  duoFinishedMessage,
  duoSessionName,
  isAgreementVote,
  isWaitingForPartner,
  partnerOf,
} from './duo'

import type { ParticipantWithProfile } from '@/data-access/models'

const ME = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

function participant(profileId: string, pseudo: string, finished = false): ParticipantWithProfile {
  return {
    has_finished_voting: finished,
    id: `p-${profileId}`,
    joined_at: '2026-09-29T08:00:00Z',
    profile_id: profileId,
    session_id: 's',
    super_dislike_used: false,
    superlike_used: false,
    profiles: { id: profileId, pseudo },
  }
}

describe('isAgreementVote', () => {
  it('should count « ça me va » and a coup de cœur, never « bof » nor a veto', () => {
    expect(isAgreementVote(1)).toBe(true)
    expect(isAgreementVote(2)).toBe(true)
    expect(isAgreementVote(0)).toBe(false)
    expect(isAgreementVote(-2)).toBe(false)
  })
})

describe('partnerOf', () => {
  it('should find the other person, or nobody while the link is unopened', () => {
    const me = participant(ME, 'Moi')
    expect(partnerOf([me], ME)).toBeNull()
    expect(isWaitingForPartner([me])).toBe(true)

    const other = participant(OTHER, 'Toi')
    expect(partnerOf([me, other], ME)).toBe(other)
    expect(isWaitingForPartner([me, other])).toBe(false)
  })
})

describe('duoFinishedMessage', () => {
  it('should wait for the other to open the link', () => {
    expect(duoFinishedMessage(null)).toMatch(/pas encore ouvert le lien/)
  })

  it('should name the other while an agreement is still possible', () => {
    expect(duoFinishedMessage(participant(OTHER, 'Camille'))).toMatch(/Si Camille dit « ça me va »/)
  })

  it('should announce the ranking when both decks are done without agreement', () => {
    expect(duoFinishedMessage(participant(OTHER, 'Camille', true))).toMatch(/le classement arrive/)
  })
})

describe('duoAgreement', () => {
  const row = (decided: boolean, likes: number, superlikes: number) => ({
    decided,
    likes,
    superlikes,
  })

  it('should read the decided restaurant both said yes to', () => {
    const agreed = row(true, 1, 1)
    expect(duoAgreement([row(false, 0, 1), agreed])).toBe(agreed)
    expect(duoAgreement([row(true, 2, 0)])).not.toBeNull()
  })

  it('should not call a decision without two « yes » an agreement', () => {
    // Duo clos sans accord, puis « On y va » du host : une décision ordinaire.
    expect(duoAgreement([row(true, 1, 0), row(false, 1, 0)])).toBeNull()
  })

  it('should find nothing while nothing is decided', () => {
    expect(duoAgreement([row(false, 2, 0)])).toBeNull()
    expect(duoAgreement([])).toBeNull()
  })
})

describe('duoSessionName', () => {
  it('should name the meal and the day, nothing to type', () => {
    expect(duoSessionName(new Date(2026, 8, 29, 12, 0))).toBe('À deux · déj du mardi')
    expect(duoSessionName(new Date(2026, 8, 29, 20, 0))).toBe('À deux · dîner du mardi')
  })
})
