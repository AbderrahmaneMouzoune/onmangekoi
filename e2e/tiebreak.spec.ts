import { expect, test } from './support/i18n'

import type { Browser, Page } from '@playwright/test'

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

  test('du match nul au tirage au sort', async ({ browser, i18n: { t, match } }) => {
    const host = await newPage(browser)
    const guest = await newPage(browser)

    // 1. Une session à deux restaurants
    await host.goto('/sessions/new')
    await host.getByLabel(t('onboarding.pseudo.label')).fill('Alex')
    await host.getByRole('button', { name: t('onboarding.pseudo.submit') }).click()
    await host.getByLabel(t('session.create.steps.name')).fill('E2E égalité')
    const results = host.getByRole('list', { name: t('restaurants.catalog.label') })
    await results.getByRole('checkbox').nth(0).click()
    await results.getByRole('checkbox').nth(1).click()
    await host.getByRole('button', { name: t('session.create.submit', { count: 2 }) }).click()
    await expect(host).toHaveURL(/\/sessions\/[0-9A-HJKMNP-TV-Z]{6}$/)

    const code = await host.getByTestId('invite-code').getAttribute('data-code')
    const sessionUrl = host.url()

    await guest.goto('/join')
    await guest.getByLabel(t('onboarding.pseudo.label')).fill('Sam')
    await guest.getByRole('button', { name: t('onboarding.pseudo.submit') }).click()
    await guest.getByLabel(t('session.join.label')).fill(code as string)
    await guest.getByRole('button', { name: t('common.actions.join') }).click()
    await expect(guest).toHaveURL(sessionUrl)

    // 2. Les mêmes votes des deux côtés : aucun départage possible au score
    await host.getByRole('button', { name: t('session.waiting.launch') }).click()
    for (const page of [host, guest]) {
      await expect(page.getByRole('group', { name: t('session.vote.group') })).toBeVisible()
      await page.getByRole('button', { name: match('session.vote.actions.yes') }).click()
      await page.getByRole('button', { name: match('session.vote.actions.yes') }).click()
    }

    await expect(host).toHaveURL(/\/results$/, { timeout: 15_000 })
    await expect(guest).toHaveURL(/\/results$/, { timeout: 15_000 })
    await expect(host.getByText(match('session.results.tie.open'))).toBeVisible()

    // 3. Le départage est réservé au host ; l'invité l'attend
    await expect(guest.getByText(match('session.tiebreak.guestText'))).toBeVisible()
    const drawName = t('session.tiebreak.draw')
    await expect(guest.getByRole('button', { name: drawName })).toHaveCount(0)

    // 4. Tirage au sort, confirmé en deux temps
    await host.getByRole('button', { name: drawName }).click()
    await host.getByRole('button', { name: t('session.tiebreak.confirmDraw') }).click()

    const drawn = match('session.results.tie.draw')
    await expect(host.getByText(drawn)).toBeVisible({ timeout: 15_000 })
    // L'invité lit le même gagnant, sans avoir rien fait : c'est la base qui
    // a tranché, une fois pour tout le monde.
    await expect(guest.getByText(drawn)).toBeVisible({ timeout: 15_000 })
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
