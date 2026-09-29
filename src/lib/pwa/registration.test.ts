// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getServiceWorkerRegistration,
  isServiceWorkerEnabled,
  registerServiceWorker,
} from './registration'

function stubServiceWorker(container: Partial<ServiceWorkerContainer>) {
  Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true })
}

describe('service worker registration', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    Reflect.deleteProperty(navigator, 'serviceWorker')
  })

  it('should only be enabled on a production build', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(isServiceWorkerEnabled()).toBe(false)
    vi.stubEnv('NODE_ENV', 'production')
    expect(isServiceWorkerEnabled()).toBe(true)
  })

  it('should register /sw.js at the root, bypassing the HTTP cache', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const register = vi.fn(async () => ({}) as ServiceWorkerRegistration)
    stubServiceWorker({ register })

    await registerServiceWorker()

    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' })
  })

  it('should unregister leftover workers outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const unregister = vi.fn(async () => true)
    const register = vi.fn()
    stubServiceWorker({
      register,
      getRegistrations: async () => [{ unregister } as unknown as ServiceWorkerRegistration],
    })

    expect(await registerServiceWorker()).toBeNull()
    expect(unregister).toHaveBeenCalled()
    expect(register).not.toHaveBeenCalled()
  })

  it('should give up on the registration instead of waiting forever', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    stubServiceWorker({ ready: new Promise<ServiceWorkerRegistration>(() => undefined) })

    expect(await getServiceWorkerRegistration(10)).toBeNull()
  })

  it('should hand over the active registration', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const registration = { scope: '/' } as ServiceWorkerRegistration
    stubServiceWorker({ ready: Promise.resolve(registration) })

    expect(await getServiceWorkerRegistration()).toBe(registration)
  })
})
