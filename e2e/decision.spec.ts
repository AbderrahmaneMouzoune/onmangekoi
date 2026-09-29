import { expect, test, type Browser, type Page } from '@playwright/test'

/**
 * « On y va » (issue #55) : deux navigateurs, deux restaurants, un vote net.
 *  1. Sans décision, le classement est celui d'avant ; seul le host se voit
 *     proposer de confirmer.
 *  2. Le host retient l'autre restaurant — le premier a baissé le rideau.
 *  3. L'invité lit la décision sans recharger : elle arrive par Realtime,
 *     comme la clôture.
 */
test.describe('Décision du host', () => {
  test.skip(process.env.E2E !== '1', 'Nécessite une stack Supabase locale (E2E=1).')

  test('du classement au déjeuner', async ({ browser }) => {
    const host = await newPage(browser)
    const guest = await newPage(browser)

    // 1. Une session à deux restaurants
    await host.goto('/sessions/new')
    await host.getByLabel('Ton pseudo').fill('Alex')
    await host.getByRole('button', { name: /c’est parti/i }).click()
    await host.getByLabel('Nom de la session').fill('E2E décision')
    const results = host.getByRole('list', { name: 'Résultats' })
    await results.getByRole('checkbox').nth(0).click()
    await results.getByRole('checkbox').nth(1).click()
    await host.getByRole('button', { name: /créer la session · 2 restos/i }).click()
    await expect(host).toHaveURL(/\/sessions\/[0-9A-HJKMNP-TV-Z]{6}$/)

    const code = await host.getByTestId('invite-code').getAttribute('data-code')
    const sessionUrl = host.url()

    await guest.goto('/join')
    await guest.getByLabel('Ton pseudo').fill('Sam')
    await guest.getByRole('button', { name: /c’est parti/i }).click()
    await guest.getByLabel(/code ou lien/i).fill(code as string)
    await guest.getByRole('button', { name: 'Rejoindre' }).click()
    await expect(guest).toHaveURL(sessionUrl)

    // 2. Un vote sans égalité : le premier restaurant plaît, le second non
    await host.getByRole('button', { name: /lancer le vote/i }).click()
    for (const page of [host, guest]) {
      await expect(page.getByRole('group', { name: 'Voter' })).toBeVisible()
      await page.getByRole('button', { name: /ça me va/i }).click()
      await page.getByRole('button', { name: /bof/i }).click()
    }

    await expect(host).toHaveURL(/\/results$/, { timeout: 15_000 })
    await expect(guest).toHaveURL(/\/results$/, { timeout: 15_000 })

    // 3. Sans décision, rien ne change ; seul le host peut confirmer
    const leader = await headline(host)
    await expect(host.getByText('On mange chez', { exact: true })).toBeVisible()
    await expect(guest.getByText('On mange chez', { exact: true })).toBeVisible()
    await expect(host.getByRole('heading', { name: 'On y va ?' })).toBeVisible()
    await expect(guest.getByRole('button', { name: 'On y va' })).toHaveCount(0)

    // 4. Le host retient l'autre restaurant
    await host.getByRole('button', { name: /choisir un autre resto/i }).click()
    const picker = host.getByRole('group', { name: 'Où va le groupe ?' })
    const other = picker.getByRole('radio').nth(1)
    const otherName = (await other.locator('..').innerText()).replace(/^\d+\.\s*/, '').trim()
    await other.check()
    await host.getByRole('button', { name: 'On y va' }).click()

    await expect(host.getByRole('heading', { name: 'C’est décidé' })).toBeVisible({
      timeout: 15_000,
    })
    await expect(host.locator('#winner-title')).toHaveText(otherName)
    await expect(host.getByText(`Choix du host : le vote plaçait ${leader} en tête.`)).toBeVisible()

    // 5. L'invité lit la même décision, sans avoir rien fait
    await expect(guest.getByText(/c’est décidé · on mange chez/i)).toBeVisible({
      timeout: 15_000,
    })
    await expect(guest.locator('#winner-title')).toHaveText(otherName)
  })
})

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext()
  return context.newPage()
}

/** Le nom annoncé en tête du classement. */
async function headline(page: Page): Promise<string> {
  return ((await page.locator('#winner-title').textContent()) ?? '').trim()
}
