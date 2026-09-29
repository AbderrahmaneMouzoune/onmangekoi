import { expect, test } from './support/i18n'

import type { Browser, Page } from '@playwright/test'

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

  test('du classement au déjeuner', async ({ browser, i18n: { t, match } }) => {
    const host = await newPage(browser)
    const guest = await newPage(browser)

    // 1. Une session à deux restaurants
    await host.goto('/sessions/new')
    await host.getByLabel(t('onboarding.pseudo.label')).fill('Alex')
    await host.getByRole('button', { name: t('onboarding.pseudo.submit') }).click()
    await host.getByLabel(t('session.create.steps.name')).fill('E2E décision')
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

    // 2. Un vote sans égalité : le premier restaurant plaît, le second non
    await host.getByRole('button', { name: t('session.waiting.launch') }).click()
    for (const page of [host, guest]) {
      await expect(page.getByRole('group', { name: t('session.vote.group') })).toBeVisible()
      await page.getByRole('button', { name: match('session.vote.actions.yes') }).click()
      await page.getByRole('button', { name: match('session.vote.actions.no') }).click()
    }

    await expect(host).toHaveURL(/\/results$/, { timeout: 15_000 })
    await expect(guest).toHaveURL(/\/results$/, { timeout: 15_000 })

    // 3. Sans décision, rien ne change ; seul le host peut confirmer
    const leader = await headline(host)
    const winner = t('session.results.eyebrow.winner')
    await expect(host.getByText(winner, { exact: true })).toBeVisible()
    await expect(guest.getByText(winner, { exact: true })).toBeVisible()
    await expect(host.getByRole('heading', { name: t('session.decision.title') })).toBeVisible()
    await expect(guest.getByRole('button', { name: t('session.decision.go') })).toHaveCount(0)

    // 4. Le host retient l'autre restaurant
    await host.getByRole('button', { name: t('session.decision.other') }).click()
    const picker = host.getByRole('group', { name: t('session.decision.where') })
    const other = picker.getByRole('radio').nth(1)
    const otherName = (await other.locator('..').innerText()).replace(/^\d+\.\s*/, '').trim()
    await other.check()
    await host.getByRole('button', { name: t('session.decision.go'), exact: true }).click()

    await expect(
      host.getByRole('heading', { name: t('session.decision.decidedTitle') })
    ).toBeVisible({ timeout: 15_000 })
    await expect(host.locator('#winner-title')).toHaveText(otherName)
    await expect(host.getByText(t('session.results.overrideNote', { leader }))).toBeVisible()

    // 5. L'invité lit la même décision, sans avoir rien fait
    await expect(guest.getByText(t('session.results.eyebrow.decided'))).toBeVisible({
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
