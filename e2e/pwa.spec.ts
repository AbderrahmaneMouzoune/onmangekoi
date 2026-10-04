import { auditA11y } from './support/a11y'
import { expect, test } from './support/i18n'

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

  test('hors ligne, une navigation affiche la page dédiée', async ({
    page,
    context,
    i18n: { t },
  }, testInfo) => {
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
    // La page hors ligne a été mise en cache dans la langue du navigateur.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t('pwa.offline.title'))
    await expect(page.getByRole('button', { name: t('common.actions.retry') })).toBeVisible()
    await auditA11y(page, testInfo, 'hors ligne')
    await context.setOffline(false)
  })
})
