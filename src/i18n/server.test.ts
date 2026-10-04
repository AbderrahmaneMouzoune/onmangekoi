import { beforeEach, describe, expect, it, vi } from 'vitest'

const revalidatePath = vi.hoisted(() => vi.fn())

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn() }))

const { revalidateLocalizedPath } = await import('./server')

describe('revalidateLocalizedPath', () => {
  beforeEach(() => revalidatePath.mockReset())

  it('should invalidate a page in every language, visible URL included', () => {
    revalidateLocalizedPath('/sessions/7K3M9P')
    expect(revalidatePath.mock.calls).toEqual([
      ['/sessions/7K3M9P', undefined],
      ['/fr/sessions/7K3M9P', undefined],
      ['/en/sessions/7K3M9P', undefined],
    ])
  })

  it('should map the home page onto each language root', () => {
    revalidateLocalizedPath('/')
    expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual(['/', '/fr', '/en'])
  })

  it('should prefix a route pattern with the locale pattern', () => {
    revalidateLocalizedPath('/lists/[code]', 'page')
    expect(revalidatePath.mock.calls).toEqual([['/[locale]/lists/[code]', 'page']])
  })

  it('should keep the whole-site invalidation as it was', () => {
    revalidateLocalizedPath('/', 'layout')
    expect(revalidatePath.mock.calls).toEqual([['/', 'layout']])
  })
})
