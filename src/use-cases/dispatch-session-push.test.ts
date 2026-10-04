import { describe, expect, it, vi } from 'vitest'

import { translatePushNotice } from './dispatch-session-push'

import type { PushNotice } from '@/domain/push'

// Le cas d'usage importe l'envoi et la base ; seule la traduction est testée ici.
vi.mock('@/data-access/push', () => ({}))
vi.mock('@/data-access/web-push', () => ({}))

const VOTING: PushNotice = {
  kind: 'voting',
  session: 'Midi de mardi',
  url: '/sessions/7K3M9P',
  tag: 'session-3f1d2c4b',
}

describe('translatePushNotice', () => {
  it('should write the notification in French for a French subscriber', () => {
    expect(translatePushNotice(VOTING, 'fr')).toEqual({
      title: 'Le vote est lancé',
      body: 'Midi de mardi — à toi de voter.',
      url: '/sessions/7K3M9P',
      tag: 'session-3f1d2c4b',
      lang: 'fr',
    })
  })

  it('should write it in English for an English subscriber, same link, same tag', () => {
    expect(translatePushNotice(VOTING, 'en')).toEqual({
      title: 'Voting has started',
      body: 'Midi de mardi — your turn to vote.',
      url: '/sessions/7K3M9P',
      tag: 'session-3f1d2c4b',
      lang: 'en',
    })
  })

  it('should announce a result or an agreement in each language', () => {
    const closed = { ...VOTING, kind: 'closed' as const, url: '/sessions/7K3M9P/results' }
    expect(translatePushNotice(closed, 'fr').title).toBe('Le classement est prêt')
    expect(translatePushNotice(closed, 'en').title).toBe('The ranking is ready')
    const agreed = { ...closed, kind: 'agreed' as const }
    expect(translatePushNotice(agreed, 'fr').body).toBe(
      'Midi de mardi — vous avez trouvé où manger.'
    )
    expect(translatePushNotice(agreed, 'en').body).toBe(
      'Midi de mardi — you’ve found where to eat.'
    )
  })
})
