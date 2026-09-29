import { expect, test, type Browser, type Page } from '@playwright/test'

/**
 * Mode duo (issue #61) : décider à deux, sans salle d'attente ni code.
 *  1. `/duo` sans pseudo passe par l'onboarding, puis y revient.
 *  2. Deux restos, « C'est parti » : la session part en vote, « Envoie ce
 *     lien » au-dessus du deck — pas de code à dicter.
 *  3. Le second ouvre le lien sans pseudo : `/setup` reprend la destination,
 *     et il arrive directement sur le deck.
 *  4. Une troisième personne est refusée : deux places.
 *  5. « Bof » d'un côté, « ça me va » de l'autre : rien ne se ferme.
 *  6. Le premier « ça me va » commun ferme la session pour les deux, sans
 *     recharger : « C'est d'accord », un résultat et pas un classement.
 */
test.describe('Mode duo', () => {
  test.skip(process.env.E2E !== '1', 'Nécessite une stack Supabase locale (E2E=1).')

  test('décider à deux au premier accord', async ({ browser }) => {
    const host = await newPage(browser)
    const partner = await newPage(browser)
    const third = await newPage(browser)

    // 1. L'onboarding reprend la destination
    await host.goto('/duo')
    await expect(host).toHaveURL(/\/setup\?next=%2Fduo$/)
    await host.getByLabel('Ton pseudo').fill('Alex')
    await host.getByRole('button', { name: /c’est parti/i }).click()
    await expect(host).toHaveURL(/\/duo$/)

    // 2. Deux restos, et c'est parti — sans nom, sans échéance, sans règles
    const results = host.getByRole('list', { name: 'Résultats' })
    await results.getByRole('checkbox').nth(0).click()
    await results.getByRole('checkbox').nth(1).click()
    await host.getByRole('button', { name: /c’est parti · 2 restos/i }).click()
    await expect(host).toHaveURL(/\/sessions\/[0-9A-HJKMNP-TV-Z]{6}$/)

    await expect(host.getByRole('heading', { name: 'Envoie ce lien' })).toBeVisible()
    await expect(host.getByRole('button', { name: 'Copier le lien' })).toBeVisible()
    await expect(host.getByTestId('invite-code')).toHaveCount(0)
    await expect(host.getByRole('group', { name: 'Voter' })).toBeVisible()

    const sessionUrl = host.url()
    const code = sessionUrl.split('/').pop() as string

    // 3. Le lien, sans pseudo : onboarding, puis le deck directement
    await partner.goto(`/join/${code}`)
    await expect(partner).toHaveURL(/\/setup\?next=/)
    // L'aperçu anonyme existe tant qu'une place est libre : la règle s'annonce.
    await expect(partner.getByText('À deux : le premier « ça me va » commun décide')).toBeVisible()
    await partner.getByLabel('Ton pseudo').fill('Sam')
    await partner.getByRole('button', { name: 'Rejoindre' }).click()
    await expect(partner).toHaveURL(sessionUrl)
    await expect(partner.getByRole('group', { name: 'Voter' })).toBeVisible()
    await expect(host.getByRole('heading', { name: 'Envoie ce lien' })).toHaveCount(0, {
      timeout: 15_000,
    })

    // 4. Deux places, pas une de plus
    await third.goto(`/join/${code}`)
    // Duo complet : plus d'aperçu anonyme, l'onboarding est celui de tous.
    await third.getByLabel('Ton pseudo').fill('Tiers')
    await third.getByRole('button', { name: /c’est parti/i }).click()
    await expect(third.getByText(/Impossible de rejoindre/)).toBeVisible()
    await expect(third.getByText(/session à deux est complète/)).toBeVisible()

    // 5. Premier resto : bof contre ça me va, pas d'accord
    await host.getByRole('button', { name: /bof/i }).click()
    await partner.getByRole('button', { name: /ça me va/i }).click()
    await expect(host).toHaveURL(sessionUrl)

    // 6. Second resto : ça me va des deux côtés, c'est décidé
    await partner.getByRole('button', { name: /ça me va/i }).click()
    await host.getByRole('button', { name: /ça me va/i }).click()

    await expect(host).toHaveURL(/\/results$/, { timeout: 15_000 })
    await expect(partner).toHaveURL(/\/results$/, { timeout: 15_000 })
    await expect(host.getByText(/C’est d’accord · on mange chez/)).toBeVisible()
    await expect(partner.getByText(/C’est d’accord · on mange chez/)).toBeVisible()
    await expect(host.getByText('Le reste du classement')).toHaveCount(0)
  })
})

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext()
  return context.newPage()
}
