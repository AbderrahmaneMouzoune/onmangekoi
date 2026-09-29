import { expect, test, type Browser, type Page } from '@playwright/test'

/**
 * Session ouverte (issue #58) : pas de salle d'attente, chacun vote à son
 * heure.
 *  1. Cocher « Session ouverte » retire « Sans limite » : l'échéance devient
 *     obligatoire.
 *  2. Le host arrive directement sur le deck, l'invitation dépliée au-dessus.
 *  3. Il vote tout : la session reste ouverte, personne n'est « attendu ».
 *  4. L'invité rejoint **pendant** le vote et vote sur les mêmes cartes.
 *  5. Le host clôture à la main : tout le monde passe au classement.
 */
test.describe('Session ouverte', () => {
  test.skip(process.env.E2E !== '1', 'Nécessite une stack Supabase locale (E2E=1).')

  test('voter chacun à son heure', async ({ browser }) => {
    const host = await newPage(browser)
    const guest = await newPage(browser)

    // 1. Une session ouverte, à deux restaurants
    await host.goto('/sessions/new')
    await host.getByLabel('Ton pseudo').fill('Alex')
    await host.getByRole('button', { name: /c’est parti/i }).click()
    await host.getByLabel('Nom de la session').fill('E2E ouverte')
    const results = host.getByRole('list', { name: 'Résultats' })
    await results.getByRole('checkbox').nth(0).click()
    await results.getByRole('checkbox').nth(1).click()

    await expect(host.getByRole('radio', { name: 'Sans limite' })).toBeChecked()
    await host.getByRole('checkbox', { name: /session ouverte/i }).click()
    await expect(host.getByRole('radio', { name: 'Sans limite' })).toHaveCount(0)
    await expect(host.getByRole('radio', { name: 'dans 1 h' })).toBeChecked()

    await host.getByRole('button', { name: /créer la session · 2 restos/i }).click()
    await expect(host).toHaveURL(/\/sessions\/[0-9A-HJKMNP-TV-Z]{6}$/)

    // 2. Pas de salle d'attente : le deck, et l'invitation au-dessus
    await expect(host.getByRole('button', { name: /lancer le vote/i })).toHaveCount(0)
    await expect(host.getByRole('group', { name: 'Voter' })).toBeVisible()
    await expect(host.getByText('Session ouverte : chacun vote à son heure')).toBeVisible()
    const code = await host.getByTestId('invite-code').getAttribute('data-code')
    const sessionUrl = host.url()

    // 3. Le host vote tout : la session reste ouverte
    await host.getByRole('button', { name: /ça me va/i }).click()
    await host.getByRole('button', { name: /bof/i }).click()
    await expect(host.getByText(/La session reste ouverte jusqu’à l’échéance/)).toBeVisible()
    await expect(host).toHaveURL(sessionUrl)

    // 4. L'invité arrive pendant le vote
    await guest.goto('/join')
    await guest.getByLabel('Ton pseudo').fill('Sam')
    await guest.getByRole('button', { name: /c’est parti/i }).click()
    await guest.getByLabel(/code ou lien/i).fill(code as string)
    await guest.getByRole('button', { name: 'Rejoindre' }).click()
    await expect(guest).toHaveURL(sessionUrl)
    await expect(guest.getByRole('group', { name: 'Voter' })).toBeVisible()
    await guest.getByRole('button', { name: /ça me va/i }).click()
    await guest.getByRole('button', { name: /ça me va/i }).click()

    // 5. Tout le monde a voté, mais seule l'échéance ou le host ferment
    await expect(guest.getByText(/La session reste ouverte jusqu’à l’échéance/)).toBeVisible()
    await host.getByRole('button', { name: /clôturer maintenant/i }).click()
    await host.getByRole('button', { name: /confirmer la clôture/i }).click()

    await expect(host).toHaveURL(/\/results$/, { timeout: 15_000 })
    await expect(guest).toHaveURL(/\/results$/, { timeout: 15_000 })
  })
})

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext()
  return context.newPage()
}
