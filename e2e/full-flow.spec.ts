import { expect, test, type Browser, type Page } from '@playwright/test'

/**
 * Flow complet du MVP : deux navigateurs isolés (host + invité).
 *  1. Le host choisit un pseudo et crée une session avec deux restaurants.
 *  2. L'invité ouvre le lien d'invitation, passe par l'onboarding et revient
 *     automatiquement dans la salle d'attente (le `?next=` est conservé).
 *  3. Le host lance ; chacun vote ; la session se clôture toute seule.
 *  4. Les deux voient le classement, avec le coup de cœur en tête.
 */
test.describe('Session de vote complète', () => {
  test.skip(process.env.E2E !== '1', 'Nécessite une stack Supabase locale (E2E=1).')

  test('du pseudo au classement', async ({ browser }) => {
    const host = await newPage(browser)
    const guest = await newPage(browser)

    // 1. Host : onboarding + création
    await host.goto('/sessions/new')
    await expect(host).toHaveURL(/\/setup\?next=/)
    await host.getByLabel('Ton pseudo').fill('Alex')
    await host.getByRole('button', { name: /c’est parti/i }).click()
    await expect(host).toHaveURL(/\/sessions\/new$/)

    await host.getByLabel('Nom de la session').fill('E2E lunch')
    const results = host.getByRole('list', { name: 'Résultats' })
    await results.getByRole('checkbox').nth(0).click()
    await results.getByRole('checkbox').nth(1).click()
    await host.getByRole('button', { name: /créer la session · 2 restos/i }).click()
    await expect(host).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/)
    await expect(host.getByRole('heading', { name: 'E2E lunch' })).toBeVisible()

    const code = (await host.getByText(/^[A-Z0-9]{3} [A-Z0-9]{3}$/).textContent())?.replace(' ', '')
    expect(code).toMatch(/^[A-Z0-9]{6}$/)
    const sessionUrl = host.url()

    // 2. Invité : lien → onboarding → salle d'attente
    await guest.goto('/join')
    await expect(guest).toHaveURL(/\/setup\?next=%2Fjoin/)
    await guest.getByLabel('Ton pseudo').fill('Sam')
    await guest.getByRole('button', { name: /c’est parti/i }).click()
    await expect(guest).toHaveURL(/\/join$/)
    await guest.getByLabel(/code ou lien/i).fill(code as string)
    await guest.getByRole('button', { name: 'Rejoindre' }).click()
    await expect(guest).toHaveURL(sessionUrl)
    await expect(guest.getByText(/en attente du lancement par alex/i)).toBeVisible()

    // Le host voit arriver Sam en temps réel
    await expect(host.getByText('Sam')).toBeVisible()
    await expect(host.getByText('2 participants')).toBeVisible()

    // 3. Lancement et votes
    await host.getByRole('button', { name: /lancer le vote/i }).click()
    await expect(host.getByRole('group', { name: 'Voter' })).toBeVisible()
    await expect(guest.getByRole('group', { name: 'Voter' })).toBeVisible()

    await host.getByRole('button', { name: /coup de cœur/i }).click()
    await expect(host.getByRole('button', { name: /coup de cœur/i })).toBeDisabled()
    await host.getByRole('button', { name: /bof/i }).click()
    await expect(host.getByText(/tu as tout voté/i)).toBeVisible()

    await guest.getByRole('button', { name: /ça me va/i }).click()
    await guest.getByRole('button', { name: /veto/i }).click()

    // 4. Clôture automatique → classement pour les deux
    await expect(host).toHaveURL(/\/results$/, { timeout: 15_000 })
    await expect(guest).toHaveURL(/\/results$/, { timeout: 15_000 })
    await expect(host.getByText(/on mange chez/i)).toBeVisible()
    await expect(host.getByText('+3')).toBeVisible()
    await expect(guest.getByText('−2')).toBeVisible()
  })
})

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext()
  return context.newPage()
}
