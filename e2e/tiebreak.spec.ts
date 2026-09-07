import { expect, test, type Browser, type Page } from '@playwright/test'

/**
 * Égalité parfaite tranchée par le host (issue #10) : deux navigateurs, deux
 * restaurants, et exactement les mêmes votes des deux côtés.
 *  1. Le classement annonce l'égalité aux deux participants.
 *  2. Seul le host se voit proposer de départager.
 *  3. Le tirage au sort désigne un gagnant en base — l'invité le lit sans
 *     recharger, et c'est le même que celui du host.
 */
test.describe('Départage d’une égalité', () => {
  test.skip(process.env.E2E !== '1', 'Nécessite une stack Supabase locale (E2E=1).')

  test('du match nul au tirage au sort', async ({ browser }) => {
    const host = await newPage(browser)
    const guest = await newPage(browser)

    // 1. Une session à deux restaurants
    await host.goto('/sessions/new')
    await host.getByLabel('Ton pseudo').fill('Alex')
    await host.getByRole('button', { name: /c’est parti/i }).click()
    await host.getByLabel('Nom de la session').fill('E2E égalité')
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

    // 2. Les mêmes votes des deux côtés : aucun départage possible au score
    await host.getByRole('button', { name: /lancer le vote/i }).click()
    for (const page of [host, guest]) {
      await expect(page.getByRole('group', { name: 'Voter' })).toBeVisible()
      await page.getByRole('button', { name: /ça me va/i }).click()
      await page.getByRole('button', { name: /ça me va/i }).click()
    }

    await expect(host).toHaveURL(/\/results$/, { timeout: 15_000 })
    await expect(guest).toHaveURL(/\/results$/, { timeout: 15_000 })
    await expect(host.getByText(/égalité parfaite avec/i)).toBeVisible()

    // 3. Le départage est réservé au host ; l'invité l'attend
    await expect(guest.getByText(/le host va trancher/i)).toBeVisible()
    await expect(guest.getByRole('button', { name: /tirage au sort/i })).toHaveCount(0)

    // 4. Tirage au sort, confirmé en deux temps
    const draw = host.getByRole('button', { name: /tirage au sort/i })
    await draw.click()
    await host.getByRole('button', { name: /le sort désigne le gagnant/i }).click()

    await expect(host.getByText(/désigné par tirage au sort/i)).toBeVisible({ timeout: 15_000 })
    // L'invité lit le même gagnant, sans avoir rien fait : c'est la base qui
    // a tranché, une fois pour tout le monde.
    await expect(guest.getByText(/désigné par tirage au sort/i)).toBeVisible({ timeout: 15_000 })
    expect(await winnerName(guest)).toBe(await winnerName(host))
  })
})

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext()
  return context.newPage()
}

/** Le nom en tête du classement — « On mange chez … ». */
async function winnerName(page: Page): Promise<string> {
  return (await page.locator('#winner-title').textContent()) ?? ''
}
