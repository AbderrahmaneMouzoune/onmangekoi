import { expect, test } from '@playwright/test'

/**
 * Langues (issue #14, phase A) : la langue suit le navigateur à la première
 * visite, le sélecteur du pied de page la change et la retient, et les URL
 * restent sans préfixe de langue — un lien d'invitation est le même pour tous.
 *
 * Les autres specs tournent en `fr-FR` ; celle-ci part d'un navigateur anglais.
 */
test.describe('Langues', () => {
  test.skip(process.env.E2E !== '1', 'Nécessite une stack Supabase locale (E2E=1).')
  test.use({ locale: 'en-US' })

  test('un navigateur anglais reçoit l’anglais, sans préfixe dans l’URL', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Where are we eating?')
    expect(new URL(page.url()).pathname).toBe('/')

    await page.goto('/setup')
    await expect(page.getByLabel('Your nickname')).toBeVisible()
    expect(new URL(page.url()).pathname).toBe('/setup')
  })

  test('le sélecteur passe en français et s’en souvient', async ({ page, context }) => {
    await page.goto('/')
    const footer = page.getByRole('contentinfo')
    await footer.getByRole('button', { name: 'Français' }).click()

    await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Où est-ce qu’on mange ?')
    await expect(footer.getByRole('button', { name: 'Français' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )

    const cookies = await context.cookies()
    expect(cookies.find((cookie) => cookie.name === 'NEXT_LOCALE')?.value).toBe('fr')

    // Le choix l'emporte sur la langue du navigateur, page après page.
    await page.goto('/offline')
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pas de réseau, pas de vote.')
  })

  test('une adresse inconnue répond 404, dans les deux langues', async ({ page }) => {
    const response = await page.goto('/cette-page-n-existe-pas')
    expect(response?.status()).toBe(404)
    await expect(page.getByText('This page isn’t on the menu')).toBeVisible()
    await expect(page.getByText('Cette page n’est pas au menu')).toBeVisible()
  })
})
