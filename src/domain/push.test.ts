import { describe, expect, it } from 'vitest'

import { isGoneSubscription, pushMessageFor, pushTopic, PUSH_TTL_SECONDS } from './push'
import { PushDispatchSchema, PushSubscriptionSchema } from './schemas/push'

const SESSION = {
  id: '3f1d2c4b-5a6e-4d7f-8a9b-0c1d2e3f4a5b',
  name: 'Midi de mardi',
  invite_code: '7K3M9P',
}

describe('pushMessageFor', () => {
  it('should call to vote in the session room when the vote starts', () => {
    expect(pushMessageFor('voting', SESSION)).toEqual({
      title: 'Le vote est lancé',
      body: 'Midi de mardi — à toi de voter.',
      url: '/sessions/7K3M9P',
      tag: `session-${SESSION.id}`,
    })
  })

  it('should open the results when the session closes, under the same tag', () => {
    const message = pushMessageFor('closed', SESSION)
    expect(message.title).toBe('Le classement est prêt')
    expect(message.url).toBe('/sessions/7K3M9P/results')
    expect(message.tag).toBe(pushMessageFor('voting', SESSION).tag)
  })
})

describe('push delivery options', () => {
  it('should keep a launch shorter than a result', () => {
    expect(PUSH_TTL_SECONDS.voting).toBeLessThan(PUSH_TTL_SECONDS.closed)
  })

  it('should derive a topic the push services accept (32 base64url characters at most)', () => {
    const topic = pushTopic(SESSION.id)
    expect(topic).toMatch(/^[A-Za-z0-9_-]{1,32}$/)
    expect(topic).toHaveLength(32)
  })

  it('should only treat 404 and 410 as a dead subscription', () => {
    expect(isGoneSubscription(404)).toBe(true)
    expect(isGoneSubscription(410)).toBe(true)
    expect(isGoneSubscription(429)).toBe(false)
    expect(isGoneSubscription(500)).toBe(false)
    expect(isGoneSubscription(undefined)).toBe(false)
  })
})

describe('PushSubscriptionSchema', () => {
  const valid = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    expirationTime: null,
    keys: {
      p256dh:
        'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM=',
      auth: 'tBHItJI5svbpez7KI4CCXg==',
    },
  }

  it('should keep only the endpoint and the keys', () => {
    const parsed = PushSubscriptionSchema.parse(valid)
    expect(parsed).toEqual({ endpoint: valid.endpoint, keys: valid.keys })
  })

  it('should refuse a non-HTTPS endpoint or keys that are not base64url', () => {
    expect(PushSubscriptionSchema.safeParse({ ...valid, endpoint: 'http://x.test/' }).success).toBe(
      false
    )
    expect(
      PushSubscriptionSchema.safeParse({ ...valid, keys: { ...valid.keys, auth: 'a b' } }).success
    ).toBe(false)
    expect(PushSubscriptionSchema.safeParse({ endpoint: valid.endpoint }).success).toBe(false)
  })
})

describe('PushDispatchSchema', () => {
  it('should accept a launch, a close, and a close without author', () => {
    expect(
      PushDispatchSchema.safeParse({
        session_id: SESSION.id,
        status: 'voting',
        actor_id: SESSION.id,
      }).success
    ).toBe(true)
    expect(
      PushDispatchSchema.safeParse({ session_id: SESSION.id, status: 'closed', actor_id: null })
        .success
    ).toBe(true)
  })

  it('should refuse any other status', () => {
    expect(
      PushDispatchSchema.safeParse({ session_id: SESSION.id, status: 'waiting', actor_id: null })
        .success
    ).toBe(false)
  })
})
