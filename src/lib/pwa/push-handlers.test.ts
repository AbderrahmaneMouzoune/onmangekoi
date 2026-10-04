import { describe, expect, it } from 'vitest'

import { notificationTarget, pickWindow, readPushMessage } from './push-handlers'

const ORIGIN = 'https://onmangekoi.test'

const MESSAGE = {
  title: 'Le classement est prêt',
  body: 'Midi de mardi — découvre où vous allez manger.',
  url: '/sessions/7K3M9P/results',
  tag: 'session-3f1d2c4b',
  lang: 'fr',
}

describe('readPushMessage', () => {
  it('should read the payload sent by the dispatch route', () => {
    expect(readPushMessage(MESSAGE, ORIGIN)).toEqual(MESSAGE)
  })

  it('should carry the language of the text, French when an older payload has none', () => {
    expect(readPushMessage({ ...MESSAGE, lang: 'en' }, ORIGIN)?.lang).toBe('en')
    expect(readPushMessage({ ...MESSAGE, lang: undefined }, ORIGIN)?.lang).toBe('fr')
    expect(readPushMessage({ ...MESSAGE, lang: '<script>' }, ORIGIN)?.lang).toBe('fr')
  })

  it('should reject a payload that is not ours', () => {
    expect(readPushMessage(null, ORIGIN)).toBeNull()
    expect(readPushMessage('texte', ORIGIN)).toBeNull()
    expect(readPushMessage({ ...MESSAGE, title: '' }, ORIGIN)).toBeNull()
    expect(readPushMessage({ ...MESSAGE, tag: 3 }, ORIGIN)).toBeNull()
  })

  it('should only accept an address inside the app', () => {
    expect(readPushMessage({ ...MESSAGE, url: 'https://evil.test/' }, ORIGIN)).toBeNull()
    expect(readPushMessage({ ...MESSAGE, url: '//evil.test/' }, ORIGIN)).toBeNull()
    expect(readPushMessage({ ...MESSAGE, url: 'javascript:alert(1)' }, ORIGIN)).toBeNull()
    expect(readPushMessage({ ...MESSAGE, url: `${ORIGIN}/sessions/X` }, ORIGIN)).toBeNull()
  })
})

describe('notificationTarget', () => {
  it('should keep an internal path and fall back to home otherwise', () => {
    expect(notificationTarget('/sessions/7K3M9P', ORIGIN)).toBe('/sessions/7K3M9P')
    expect(notificationTarget('https://evil.test/', ORIGIN)).toBe('/')
    expect(notificationTarget('//evil.test/', ORIGIN)).toBe('/')
    expect(notificationTarget(undefined, ORIGIN)).toBe('/')
  })
})

describe('pickWindow', () => {
  const urls = (...paths: string[]) => paths.map((path) => `${ORIGIN}${path}`)

  it('should focus a window already on the target', () => {
    expect(pickWindow('/sessions/7K3M9P', urls('/', '/sessions/7K3M9P/'), ORIGIN)).toEqual({
      index: 1,
      navigate: false,
    })
  })

  it('should move a window of the same session', () => {
    expect(pickWindow('/sessions/7K3M9P/results', urls('/sessions/7K3M9P'), ORIGIN)).toEqual({
      index: 0,
      navigate: true,
    })
  })

  it('should leave other sessions and other pages alone', () => {
    expect(pickWindow('/sessions/7K3M9P', urls('/sessions/AAAAAA', '/lists'), ORIGIN)).toBeNull()
    expect(pickWindow('/sessions/7K3M9P', ['https://evil.test/sessions/7K3M9P'], ORIGIN)).toBeNull()
    expect(pickWindow('/sessions/7K3M9P', [], ORIGIN)).toBeNull()
  })
})

describe('self-contained push handlers', () => {
  // Même contrat que `sw-routing.ts` : seules les sources voyagent jusqu'au
  // service worker. Réévaluées hors du module, elles répondent pareil.
  it('should behave the same once copied out of this module', () => {
    const read = new Function(`return (${readPushMessage.toString()})`)() as typeof readPushMessage
    const target = new Function(
      `return (${notificationTarget.toString()})`
    )() as typeof notificationTarget
    const pick = new Function(`return (${pickWindow.toString()})`)() as typeof pickWindow

    expect(read(MESSAGE, ORIGIN)).toEqual(MESSAGE)
    expect(target('https://evil.test/', ORIGIN)).toBe('/')
    expect(pick('/sessions/7K3M9P/results', [`${ORIGIN}/sessions/7K3M9P`], ORIGIN)).toEqual({
      index: 0,
      navigate: true,
    })
  })
})
