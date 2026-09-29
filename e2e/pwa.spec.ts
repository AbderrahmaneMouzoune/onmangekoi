import { expect, test } from '@playwright/test'

import { auditA11y } from './support/a11y'

/**
 * PWA (issue #11) : le service worker s'installe sur un build de production,
 * précache l'app shell et, sans réseau, une navigation tombe sur la page hors
 * ligne plutôt que sur l'erreur du navigateur.
 */
test.describe('PWA', () => {
  test.skip(process.env.E2E !== '1', 'Nécessite une stack Supabase locale (E2E=1).')

  test('manifest installable, icônes maskable', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest')
    expect(response.ok()).toBe(true)
    const manifest = (await response.json()) as {
      display: string
      icons: { src: string; sizes: string; purpose?: string }[]
    }
    expect(manifest.display).toBe('standalone')
    expect(manifest.icons).toContainEqual(
      expect.objectContaining({ sizes: '512x512', purpose: 'maskable' })
    )
    for (const icon of manifest.icons) {
      expect((await request.get(icon.src)).ok(), icon.src).toBe(true)
    }
  })

  test('hors ligne, une navigation affiche la page dédiée', async ({ page, context }, testInfo) => {
    await page.goto('/legal/privacy')
    const scope = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready
      return registration.scope
    })
    expect(new URL(scope).pathname).toBe('/')
    // Le service worker prend la main sans attendre : la page doit être sous son contrôle.
    await expect
      .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
      .toBe(true)

    await context.setOffline(true)
    await page.goto('/sessions')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pas de réseau, pas de vote.')
    await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible()
    await auditA11y(page, testInfo, 'hors ligne')
    await context.setOffline(false)
  })
})
