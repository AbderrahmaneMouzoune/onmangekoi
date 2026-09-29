import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildServiceWorker, cacheNames } from './service-worker'

/**
 * Le script servi sur `/sw.js` est exécuté ici tel quel, contre un faux
 * environnement de service worker (`self`, `caches`, `fetch`) : ce sont les
 * gestionnaires réellement livrés qui sont testés, pas une copie.
 */

const ORIGIN = 'https://onmangekoi.test'
const SUPABASE = 'https://abc.supabase.co'

const OFFLINE_HTML = `<!doctype html><html><head>
<link rel="preload" href="/_next/static/media/font-s.p.woff2" as="font">
<link rel="stylesheet" href="/_next/static/chunks/app.css">
</head><body><script src="/_next/static/chunks/main.js"></script></body></html>`

const absolute = (input: RequestInfo | URL) =>
  input instanceof Request ? input.url : new URL(String(input), ORIGIN).href

/** `Request` du service worker : les URL relatives s'y résolvent contre son origine. */
class WorkerRequest extends Request {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(absolute(input), init)
  }
}

class FakeCache {
  store = new Map<string, Response>()
  constructor(private readonly fetcher: typeof fetch) {}
  async match(input: RequestInfo | URL) {
    return this.store.get(absolute(input))?.clone()
  }
  async put(input: RequestInfo | URL, response: Response) {
    this.store.set(absolute(input), response)
  }
  async add(input: RequestInfo | URL) {
    const response = await this.fetcher(absolute(input))
    if (!response.ok) throw new TypeError(`échec ${absolute(input)}`)
    await this.put(input, response)
  }
  async addAll(inputs: (RequestInfo | URL)[]) {
    for (const input of inputs) await this.add(input)
  }
}

function fakeCaches(fetcher: typeof fetch) {
  const all = new Map<string, FakeCache>()
  return {
    all,
    async open(name: string) {
      if (!all.has(name)) all.set(name, new FakeCache(fetcher))
      return all.get(name) as FakeCache
    },
    async keys() {
      return Array.from(all.keys())
    },
    async delete(name: string) {
      return all.delete(name)
    },
    async match(input: RequestInfo | URL) {
      for (const cache of all.values()) {
        const hit = await cache.match(input)
        if (hit) return hit
      }
      return undefined
    },
  }
}

type Handler = (event: Record<string, unknown>) => void

function loadWorker(version = 'build-2') {
  const network = vi.fn(async (input: RequestInfo | URL) => {
    const url = absolute(input)
    const body = url.endsWith('/offline') ? OFFLINE_HTML : `contenu de ${url}`
    // Une réponse de même origine, comme le navigateur la rend (`basic`).
    return Object.defineProperty(new Response(body, { status: 200 }), 'type', { value: 'basic' })
  })
  const caches = fakeCaches(network as unknown as typeof fetch)
  const handlers: Record<string, Handler> = {}
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, handler: Handler) => {
      handlers[type] = handler
    },
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined) },
    registration: { navigationPreload: { enable: vi.fn(async () => undefined) } },
  }

  const source = buildServiceWorker({
    version,
    supabaseOrigin: SUPABASE,
    offlineUrl: '/offline',
    precacheUrls: ['/manifest.webmanifest', '/icon'],
  })
  new Function('self', 'caches', 'fetch', 'Request', source)(self, caches, network, WorkerRequest)

  return { handlers, caches, network, self }
}

async function lifecycle(handler: Handler) {
  const pending: Promise<unknown>[] = []
  handler({ waitUntil: (promise: Promise<unknown>) => pending.push(promise) })
  await Promise.all(pending)
}

function fetchEvent(url: string, init: RequestInit & { mode?: string } = {}) {
  const request = new Request(url, { ...init, mode: undefined })
  // `mode: navigate` ne se construit pas à la main : on le simule.
  Object.defineProperty(request, 'mode', { value: init.mode ?? 'cors' })
  let response: Promise<Response> | null = null
  const event = {
    request,
    preloadResponse: Promise.resolve(undefined),
    respondWith: (value: Promise<Response>) => {
      response = value
    },
  }
  return { event, response: () => response }
}

describe('buildServiceWorker', () => {
  it('should name its caches after the build', () => {
    const source = buildServiceWorker({
      version: 'abc123',
      supabaseOrigin: SUPABASE,
      offlineUrl: '/offline',
      precacheUrls: [],
    })
    expect(source).toContain(JSON.stringify(cacheNames('abc123').precache))
    expect(source).toContain(JSON.stringify(cacheNames('abc123').runtime))
    expect(() => new Function(source)).not.toThrow()
  })

  it('should change from one build to the next', () => {
    const config = { supabaseOrigin: SUPABASE, offlineUrl: '/offline', precacheUrls: [] }
    expect(buildServiceWorker({ ...config, version: 'a' })).not.toBe(
      buildServiceWorker({ ...config, version: 'b' })
    )
  })
})

describe('service worker', () => {
  let worker: ReturnType<typeof loadWorker>

  beforeEach(() => {
    worker = loadWorker()
  })

  it('should precache the offline page, its assets, the manifest and the icons', async () => {
    await lifecycle(worker.handlers.install)

    const precache = worker.caches.all.get(cacheNames('build-2').precache)
    expect(Array.from(precache?.store.keys() ?? []).sort()).toEqual(
      [
        '/_next/static/chunks/app.css',
        '/_next/static/chunks/main.js',
        '/_next/static/media/font-s.p.woff2',
        '/icon',
        '/manifest.webmanifest',
        '/offline',
      ].map((path) => `${ORIGIN}${path}`)
    )
    expect(worker.self.skipWaiting).toHaveBeenCalled()
  })

  it('should drop the caches of previous builds on activation, and only those', async () => {
    await worker.caches.open('omk-build-1-precache')
    await worker.caches.open('omk-build-1-static')
    await worker.caches.open('une-autre-app')
    await lifecycle(worker.handlers.install)

    await lifecycle(worker.handlers.activate)

    expect(Array.from(worker.caches.all.keys()).sort()).toEqual([
      cacheNames('build-2').precache,
      'une-autre-app',
    ])
    expect(worker.self.clients.claim).toHaveBeenCalled()
  })

  it('should stay out of Supabase requests and Server Actions', () => {
    const supabase = fetchEvent(`${SUPABASE}/rest/v1/sessions`)
    worker.handlers.fetch(supabase.event)
    expect(supabase.response()).toBeNull()

    const action = fetchEvent(`${ORIGIN}/sessions/7K3M9P`, {
      method: 'POST',
      headers: { 'Next-Action': 'abc' },
    })
    worker.handlers.fetch(action.event)
    expect(action.response()).toBeNull()
  })

  it('should serve the offline page when a navigation cannot reach the network', async () => {
    await lifecycle(worker.handlers.install)
    worker.network.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const navigation = fetchEvent(`${ORIGIN}/sessions/7K3M9P`, { mode: 'navigate' })
    worker.handlers.fetch(navigation.event)

    const response = await navigation.response()
    expect(await response?.text()).toBe(OFFLINE_HTML)
  })

  it('should never store a page, even a successful one', async () => {
    const navigation = fetchEvent(`${ORIGIN}/`, { mode: 'navigate' })
    worker.handlers.fetch(navigation.event)

    expect(await (await navigation.response())?.text()).toBe(`contenu de ${ORIGIN}/`)
    expect(await worker.caches.match(`${ORIGIN}/`)).toBeUndefined()
  })

  it('should fetch a static file once, then serve it from the cache', async () => {
    const url = `${ORIGIN}/_next/static/chunks/page.js`

    const first = fetchEvent(url)
    worker.handlers.fetch(first.event)
    await first.response()
    await vi.waitFor(async () => expect(await worker.caches.match(url)).toBeDefined())

    const second = fetchEvent(url)
    worker.handlers.fetch(second.event)
    expect(await (await second.response())?.text()).toBe(`contenu de ${url}`)
    expect(worker.network).toHaveBeenCalledTimes(1)
  })
})
